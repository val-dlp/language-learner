import { createHash } from "node:crypto";
import type { Workspace } from "@/lib/workspace/store";
import { WorkspaceError } from "@/lib/workspace/files";
import {
    LessonDraftSchema,
    QUEUE_PATH,
    emptyQueue,
    DEFAULT_QUEUE_CONFIG,
    type Lesson,
    type QueueState,
} from "./schema";
export async function publishLesson(
    workspace: Workspace,
    draftPath: string,
    revision: number,
) {
    if (!/^plugins\/vocabulary\/drafts\/[^/]+\.json$/.test(draftPath))
        throw new WorkspaceError("Publish a vocabulary draft document.");
    const doc = await workspace.read(draftPath, "home");
    if (doc.meta.revision !== revision)
        throw new WorkspaceError("Draft changed; read it again.", 409);
    const draft = LessonDraftSchema.parse(JSON.parse(doc.content));
    if (new Set(draft.questions.map((q) => q.id)).size !== 10)
        throw new WorkspaceError("Question IDs must be unique.");
    if (new Set(draft.sourceDocuments.map((d) => d.path)).size !== 2)
        throw new WorkspaceError(
            "Reference both profile and curriculum revisions.",
        );
    const sourceHashes: Record<string, string> = {};
    for (const ref of draft.sourceDocuments) {
        const source = await workspace.read(ref.path, "home");
        if (source.meta.revision !== ref.revision)
            throw new WorkspaceError(
                `Source changed: ${ref.path}. Reconsider the lesson using its latest revision.`,
                409,
            );
        sourceHashes[ref.path] = source.meta.hash;
    }
    const planId = createHash("sha256")
        .update(JSON.stringify({ draft, sourceHashes }))
        .digest("hex")
        .slice(0, 24);
    return workspace.mutate(async (tx) => {
        const state = await tx.get(QUEUE_PATH, emptyQueue());
        const config = await tx.get(
            "_system/queue-config.json",
            DEFAULT_QUEUE_CONFIG,
        );
        if (
            state.ready.includes(planId) ||
            state.active?.plan.planId === planId ||
            state.completed.includes(planId) ||
            state.superseded.includes(planId)
        )
            return { planId, duplicate: true, remaining: state.ready.length };
        if (state.ready.length >= config.target)
            throw new WorkspaceError(
                "The lesson queue is full. Review or supersede a queued lesson before publishing.",
                409,
            );
        // Recheck the source content under the commit lock as a user edit may race publication.
        for (const ref of draft.sourceDocuments) {
            const bytes = await workspace.files.read(ref.path);
            if (
                !bytes ||
                createHash("sha256").update(bytes).digest("hex") !==
                    sourceHashes[ref.path]
            )
                throw new WorkspaceError(
                    "Source changed during publication; retry after reading it.",
                    409,
                );
        }
        const plan: Lesson = {
            ...draft,
            planId,
            createdAt: new Date().toISOString(),
            sourceHashes,
        };
        tx.put({
            path: `plugins/vocabulary/plans/${planId}.json`,
            content: JSON.stringify(plan, null, 2),
            policy: "immutable",
        });
        state.ready.push(planId);
        state.revision++;
        tx.put({ path: QUEUE_PATH, content: JSON.stringify(state) });
        return { planId, remaining: state.ready.length, target: config.target };
    }, "home");
}
export async function reviseQueue(
    workspace: Workspace,
    order: string[],
    reason: string,
) {
    return workspace.mutate(async (tx) => {
        const state = await tx.get<QueueState>(QUEUE_PATH, emptyQueue());
        if (
            new Set(order).size !== order.length ||
            order.some((id) => !state.ready.includes(id))
        )
            throw new WorkspaceError(
                "Use each retained queued plan ID once. Active/completed lessons cannot be changed.",
            );
        const removed = state.ready.filter((id) => !order.includes(id));
        state.superseded.push(...removed);
        state.ready = order;
        state.revision++;
        tx.put({ path: QUEUE_PATH, content: JSON.stringify(state) });
        tx.put({
            path: `home/observations/curriculum/queue-${crypto.randomUUID()}.md`,
            content: `# Queue revision\n\n${reason}\n\nSuperseded: ${removed.join(", ") || "none"}\n\nNew order: ${order.join(", ")}\n`,
            policy: "immutable",
        });
        return state;
    }, "home");
}
