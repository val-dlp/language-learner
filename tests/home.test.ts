import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { RunContext } from "@openai/agents";
import { Workspace } from "@/lib/workspace/store";
import { bootstrap } from "@/lib/workspace/bootstrap";
import { HomeService } from "@/lib/home/service";
const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0))
        await rm(root, { recursive: true, force: true });
});
async function setup() {
    const root = await mkdtemp(path.join(os.tmpdir(), "wordfield-home-"));
    roots.push(root);
    const ws = new Workspace(root);
    await bootstrap(ws, root);
    return ws;
}
it("does not acknowledge diff when a Home run fails, but does on successful completion", async () => {
    const ws = await setup();
    let fail = true;
    const service = new HomeService(ws, async (input) => {
        const tool = input.tools.find((t) => t.name === "diff")!;
        await tool.invoke(new RunContext(undefined), "{}");
        if (fail) throw new Error("provider stopped");
        input.onText("Ready");
        return { text: "Ready", usage: null };
    });
    const first = service.launch("Review changes");
    await first.work;
    expect((await service.latest())!.status).toBe("failed");
    expect(
        await ws.mutate((tx) =>
            tx.get("_system/home-state.json", { cursor: 0 }),
        ),
    ).toMatchObject({ cursor: 0 });
    fail = false;
    await service.launch("Try again").work;
    expect((await service.latest())!.status).toBe("completed");
    expect(
        (
            await ws.mutate((tx) =>
                tx.get("_system/home-state.json", { cursor: 0 }),
            )
        ).cursor,
    ).toBeGreaterThan(0);
    expect((await service.messages()).at(-1)!.text).toBe("Ready");
});
it("serializes Home runs and marks cancellation without cursor acknowledgment", async () => {
    const ws = await setup();
    let release!: (value: { text: string; usage: null }) => void;
    const service = new HomeService(
        ws,
        async () =>
            new Promise((resolve) => {
                release = resolve;
            }),
    );
    const run = service.launch("Plan");
    expect(() => service.launch("Another")).toThrow("already working");
    while (!release) await new Promise((resolve) => setTimeout(resolve, 5));
    service.cancel();
    release({ text: "late", usage: null });
    await run.work;
    expect((await service.latest())!.status).toBe("cancelled");
    expect((await service.messages()).some((m) => m.text === "late")).toBe(
        false,
    );
});
