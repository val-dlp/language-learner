import type { Workspace } from "@/lib/workspace/store";
import type { HomeService } from "./service";
import {
    DEFAULT_QUEUE_CONFIG,
    emptyQueue,
    QUEUE_PATH,
} from "@/lib/plugins/vocabulary/schema";
export const JOB_PATH = "_system/refill.json";
export type RefillJob = {
    id: string;
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    latestSession: string;
    createdAt: string;
    runId?: string;
    error?: string;
};
export function requestRefill(
    previous: RefillJob | null,
    sessionId: string,
): RefillJob {
    if (previous && ["pending", "running"].includes(previous.status))
        return { ...previous, latestSession: sessionId };
    return {
        id: crypto.randomUUID(),
        status: "pending",
        latestSession: sessionId,
        createdAt: new Date().toISOString(),
    };
}
/** Event-driven worker. A persisted event is the only reason to run automatically. */
export class RefillWorker {
    private working = false;
    private recovered = false;
    constructor(
        private ws: Workspace,
        private home: HomeService,
    ) {}
    async status() {
        return this.ws.mutate((tx) => tx.get<RefillJob | null>(JOB_PATH, null));
    }
    async retry() {
        await this.ws.mutate(async (tx) => {
            const job = await tx.get<RefillJob | null>(JOB_PATH, null);
            if (job && !["running", "pending"].includes(job.status))
                tx.put({
                    path: JOB_PATH,
                    content: JSON.stringify({
                        ...job,
                        status: "pending",
                        error: undefined,
                    }),
                });
        });
    }
    async cancel() {
        await this.ws.mutate(async (tx) => {
            const job = await tx.get<RefillJob | null>(JOB_PATH, null);
            if (job && ["running", "pending"].includes(job.status))
                tx.put({
                    path: JOB_PATH,
                    content: JSON.stringify({
                        ...job,
                        status: "cancelled",
                        error: "Refill cancelled. Ready lessons are preserved.",
                    }),
                });
        });
        if (this.home.current?.trigger === "queue_refill") this.home.cancel();
    }
    async kick() {
        if (this.working || this.home.busy) return;
        this.working = true;
        try {
            const job = await this.ws.mutate(async (tx) => {
                let job = await tx.get<RefillJob | null>(JOB_PATH, null);
                if (!this.recovered && job?.status === "running")
                    job = { ...job, status: "pending" };
                this.recovered = true;
                if (!job || job.status !== "pending") return null;
                const queue = await tx.get(QUEUE_PATH, emptyQueue());
                const config = await tx.get(
                    "_system/queue-config.json",
                    DEFAULT_QUEUE_CONFIG,
                );
                job.status =
                    queue.ready.length >= config.target
                        ? "completed"
                        : "running";
                tx.put({ path: JOB_PATH, content: JSON.stringify(job) });
                return job.status === "running" ? job : null;
            });
            if (!job) return;
            if (this.home.busy) {
                await this.ws.write({
                    path: JOB_PATH,
                    content: JSON.stringify({ ...job, status: "pending" }),
                });
                return;
            }
            const launched = this.home.launch(
                `A vocabulary session has closed (${job.latestSession}). Review newly completed evidence using diff, then restore the ready lesson queue to its configured target. Inspect the current queue before publishing.`,
                "queue_refill",
            );
            const run = await launched.work;
            await this.ws.mutate(async (tx) => {
                const current = await tx.get<RefillJob | null>(JOB_PATH, null);
                if (current?.id !== job.id || current.status === "cancelled")
                    return;
                const queue = await tx.get(QUEUE_PATH, emptyQueue());
                const config = await tx.get(
                    "_system/queue-config.json",
                    DEFAULT_QUEUE_CONFIG,
                );
                const filled = queue.ready.length >= config.target;
                tx.put({
                    path: JOB_PATH,
                    content: JSON.stringify({
                        ...current,
                        runId: run.id,
                        status:
                            run.status === "cancelled"
                                ? "cancelled"
                                : run.status === "completed" && filled
                                  ? "completed"
                                  : "failed",
                        error:
                            run.error ||
                            (!filled
                                ? "Home has not filled the queue. Check its message for clarification, or retry."
                                : undefined),
                    }),
                });
            });
        } finally {
            this.working = false;
        }
    }
}
