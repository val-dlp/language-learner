import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Workspace } from "@/lib/workspace/store";
import { bootstrap } from "@/lib/workspace/bootstrap";
const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0))
        await rm(root, { recursive: true, force: true });
});
it("preserves the original checkpoint and imports historical summaries exactly once", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wordfield-migrate-"));
    roots.push(root);
    await mkdir(path.join(root, ".local"));
    const text = JSON.stringify({
        learnerDescription: "I want to read Spanish fiction",
        logs: [
            {
                id: "prior",
                endedAt: "2026-10-01",
                summary: { overview: "Practiced tiempo" },
            },
        ],
    });
    await writeFile(path.join(root, ".local/checkpoint.json"), text);
    const ws = new Workspace(root);
    await bootstrap(ws, root);
    const first = await ws.list();
    await bootstrap(ws, root);
    expect(await ws.list()).toEqual(first);
    expect((await ws.read("home/profile.md")).content).toContain(
        "read Spanish fiction",
    );
    expect(
        await readFile(path.join(root, ".local/checkpoint.json"), "utf8"),
    ).toBe(text);
    expect(first.filter((d) => d.path.includes("legacy/"))).toHaveLength(1);
});
