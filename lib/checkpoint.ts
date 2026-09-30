import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_LEARNER, SummarySchema, type Checkpoint } from "./types";

const schema = z.object({
    revision: z.number().int().nonnegative(),
    learnerDescription: z.string(),
    logs: z.array(
        z.object({
            id: z.string(),
            endedAt: z.string(),
            questionsAnswered: z.number(),
            summary: SummarySchema,
        }),
    ),
});
export interface CheckpointStore {
    load(): Promise<Checkpoint>;
    save(checkpoint: Checkpoint): Promise<void>;
}
export class FileCheckpointStore implements CheckpointStore {
    constructor(
        private file = path.join(process.cwd(), ".local", "checkpoint.json"),
    ) {}
    async load(): Promise<Checkpoint> {
        try {
            return schema.parse(JSON.parse(await readFile(this.file, "utf8")));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                return {
                    revision: 0,
                    learnerDescription: DEFAULT_LEARNER,
                    logs: [],
                };
            throw new Error(
                "The saved checkpoint could not be read. Your existing file has been preserved.",
            );
        }
    }
    async save(checkpoint: Checkpoint) {
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = `${this.file}.${crypto.randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(checkpoint, null, 2), {
            mode: 0o600,
        });
        await rename(temporary, this.file);
    }
}
