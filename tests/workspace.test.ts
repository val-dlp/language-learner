import { afterEach, describe, expect, it } from "vitest";
import {
    mkdtemp,
    mkdir,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Workspace } from "@/lib/workspace/store";
const roots: string[] = [];
async function setup() {
    const root = await mkdtemp(path.join(os.tmpdir(), "wordfield-repo-"));
    roots.push(root);
    const workspace = new Workspace(root);
    await workspace.list();
    return { root, workspace };
}
afterEach(async () => {
    await Promise.all(
        roots
            .splice(0)
            .map((root) => rm(root, { recursive: true, force: true })),
    );
});
describe("confined document workspace", () => {
    it.each([
        "../secret",
        "/etc/passwd",
        "home/../../.env.local",
        "home\\profile.md",
        "file:secret",
        "home//profile.md",
    ])("rejects invalid paths %s for reads and writes", async (name) => {
        const { workspace } = await setup();
        await expect(workspace.read(name, "home")).rejects.toThrow();
        await expect(
            workspace.write({ path: name, content: "test" }, "home"),
        ).rejects.toThrow();
    });
    it("rejects a symlinked root, linked parents and linked files", async () => {
        const { root, workspace } = await setup();
        await mkdir(path.join(root, "outside"));
        await writeFile(path.join(root, "outside/secret"), "private");
        await symlink(
            path.join(root, "outside"),
            path.join(root, ".local/workspace/home"),
        );
        await expect(
            workspace.write(
                { path: "home/profile.md", content: "oops" },
                "home",
            ),
        ).rejects.toThrow("Symbolic");
        expect(await readFile(path.join(root, "outside/secret"), "utf8")).toBe(
            "private",
        );
        await rm(path.join(root, ".local/workspace/home"));
        await mkdir(path.join(root, ".local/workspace/home"));
        await symlink(
            path.join(root, "outside/secret"),
            path.join(root, ".local/workspace/home/profile.md"),
        );
        await expect(
            workspace.write(
                { path: "home/profile.md", content: "oops" },
                "home",
            ),
        ).rejects.toThrow();
        await rm(path.join(root, ".local/workspace"), { recursive: true });
        await symlink(
            path.join(root, "outside"),
            path.join(root, ".local/workspace"),
        );
        await expect(new Workspace(root).list()).rejects.toThrow("symbolic");
    });
    it("preserves revisions, rejects stale writes, and discovers external edits", async () => {
        const { root, workspace } = await setup();
        await workspace.write(
            { path: "home/profile.md", content: "first", expectedRevision: 0 },
            "home",
        );
        await workspace.write(
            { path: "home/profile.md", content: "second", expectedRevision: 1 },
            "home",
        );
        await expect(
            workspace.write(
                {
                    path: "home/profile.md",
                    content: "stale",
                    expectedRevision: 1,
                },
                "home",
            ),
        ).rejects.toThrow("changed");
        expect(
            (await workspace.read("home/profile.md", "home", 1)).content,
        ).toBe("first");
        await writeFile(
            path.join(root, ".local/workspace/home/profile.md"),
            "external",
        );
        const doc = await workspace.read("home/profile.md", "home");
        expect(doc.meta.revision).toBe(3);
        expect(doc.meta.actor).toBe("external");
    });
    it("protects evidence and operational files regardless of requested policy", async () => {
        const { workspace } = await setup();
        const name = "plugins/vocabulary/sessions/a/evidence.json";
        await workspace.write({
            path: name,
            content: "{}",
            policy: "immutable",
        });
        await expect(
            workspace.write(
                { path: name, content: "edited", policy: "mutable" },
                "home",
            ),
        ).rejects.toThrow("read-only");
        await expect(
            workspace.write({
                path: name,
                content: "edited",
                policy: "mutable",
            }),
        ).rejects.toThrow("immutable");
        await expect(
            workspace.read("_system/manifest.json", "home"),
        ).rejects.toThrow("scope");
        await expect(workspace.read(name, "reader")).rejects.toThrow("scope");
    });
    it("paginates changes without advancing past unseen data, and scopes reading", async () => {
        const { workspace } = await setup();
        for (let i = 0; i < 4; i++)
            await workspace.write(
                { path: `home/observations/${i}.md`, content: `note ${i}` },
                "home",
            );
        const first = await workspace.diff("home", 0, 2);
        expect(first.more).toBe(true);
        expect(first.nextCursor).toBe(2);
        await workspace.write(
            { path: "home/curriculum.md", content: "new" },
            "home",
        );
        const second = await workspace.diff(
            "home",
            first.nextCursor,
            2,
            first.through,
        );
        expect(second.more).toBe(false);
        expect(second.nextCursor).toBe(4);
        expect(
            (await workspace.diff("home", second.nextCursor)).changes,
        ).toHaveLength(1);
    });
    it("recovers a write-ahead transaction after interruption", async () => {
        const { workspace, root } = await setup();
        const original = workspace.files.write.bind(workspace.files);
        let interrupted = false;
        workspace.files.write = async (name, data) => {
            if (name === "home/profile.md" && !interrupted) {
                interrupted = true;
                throw new Error("interrupted");
            }
            return original(name, data);
        };
        await expect(
            workspace.write(
                { path: "home/profile.md", content: "durable" },
                "home",
            ),
        ).rejects.toThrow("interrupted");
        const recovered = new Workspace(root);
        expect((await recovered.read("home/profile.md", "home")).content).toBe(
            "durable",
        );
        expect((await recovered.diff("home", 0)).changes).toHaveLength(1);
    });
    it("atomically serializes operational state with evidence", async () => {
        const { workspace } = await setup();
        await Promise.all(
            Array.from({ length: 5 }, () =>
                workspace.mutate(async (tx) => {
                    const n = await tx.get("_system/counter.json", 0);
                    tx.put({
                        path: "_system/counter.json",
                        content: JSON.stringify(n + 1),
                    });
                }),
            ),
        );
        expect(
            JSON.parse((await workspace.read("_system/counter.json")).content),
        ).toBe(5);
        expect((await workspace.diff("home", 0)).changes).toHaveLength(0);
    });
});
