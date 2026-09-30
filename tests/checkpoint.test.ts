import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { FileCheckpointStore } from "@/lib/checkpoint";
const directories: string[] = [];
afterEach(async () => {
    for (const directory of directories.splice(0))
        await rm(directory, { recursive: true, force: true });
});
it("persists and recovers a real checkpoint file", async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), "wordfield-checkpoint-"),
    );
    directories.push(directory);
    const file = path.join(directory, "nested", "checkpoint.json");
    const store = new FileCheckpointStore(file);
    const checkpoint = await store.load();
    checkpoint.learnerDescription = "B1 Spanish learner";
    checkpoint.revision = 1;
    await store.save(checkpoint);
    expect(await new FileCheckpointStore(file).load()).toEqual(checkpoint);
});
it("preserves corrupt saved data instead of silently resetting it", async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), "wordfield-checkpoint-"),
    );
    directories.push(directory);
    const file = path.join(directory, "checkpoint.json");
    await writeFile(file, "invalid checkpoint");
    await expect(new FileCheckpointStore(file).load()).rejects.toThrow(
        "preserved",
    );
    expect(await readFile(file, "utf8")).toBe("invalid checkpoint");
});
