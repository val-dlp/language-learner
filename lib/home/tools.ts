import { tool } from "@openai/agents";
import { z } from "zod";
import type { Workspace, Scope } from "@/lib/workspace/store";
import { WorkspaceError } from "@/lib/workspace/files";
import { publishLesson, reviseQueue } from "@/lib/plugins/vocabulary/plans";
import {
    QUEUE_PATH,
    emptyQueue,
    DEFAULT_QUEUE_CONFIG,
    LessonDraftSchema,
} from "@/lib/plugins/vocabulary/schema";
export type ToolRecord = {
    name: string;
    input: unknown;
    output: unknown;
    durationMs: number;
    status: "ok" | "error";
};
export function documentTools(
    workspace: Workspace,
    options: {
        scope: "home" | "reader";
        signal: AbortSignal;
        cursor: number;
        record: (record: ToolRecord) => void;
        seen: (cursor: number) => void;
    },
) {
    let cursor = options.cursor;
    const wrap =
        <T>(name: string, fn: (input: T) => Promise<unknown>) =>
        async (input: T) => {
            options.signal.throwIfAborted();
            const start = Date.now();
            try {
                const output = await fn(input);
                options.record({
                    name,
                    input,
                    output,
                    durationMs: Date.now() - start,
                    status: "ok",
                });
                return output;
            } catch (error) {
                const output = {
                    error:
                        error instanceof Error ? error.message : "Tool failed",
                };
                options.record({
                    name,
                    input,
                    output,
                    durationMs: Date.now() - start,
                    status: "error",
                });
                return output;
            }
        };
    const read = tool({
        name: "read_document",
        description:
            "Read a scoped document at its current or specified revision. Large text can be read in character ranges; record any omitted text.",
        parameters: z.object({
            path: z.string(),
            revision: z.number().int().positive().nullable(),
            offset: z.number().int().nonnegative().nullable(),
            length: z.number().int().min(1).max(24000).nullable(),
        }),
        execute: wrap(
            "read_document",
            async ({ path, revision, offset, length }) => {
                const d = await workspace.read(
                    path,
                    options.scope,
                    revision ?? undefined,
                );
                const start = offset ?? 0;
                const end = start + (length ?? 16000);
                return {
                    meta: d.meta,
                    content: d.content.slice(start, end),
                    totalCharacters: d.content.length,
                    truncated: d.content.length > end,
                    nextOffset: d.content.length > end ? end : null,
                };
            },
        ),
    });
    const list = tool({
        name: "list_documents",
        description:
            "List the organized document inventory, including paths, revisions and write policies.",
        parameters: z.object({
            prefix: z.string(),
            offset: z.number().int().nonnegative().nullable(),
        }),
        execute: wrap("list_documents", async ({ prefix, offset }) => {
            const docs = await workspace.list(options.scope, prefix);
            const start = offset ?? 0;
            return {
                documents: docs.slice(start, start + 80),
                nextOffset: docs.length > start + 80 ? start + 80 : null,
            };
        }),
    });
    const search = tool({
        name: "search_documents",
        description:
            "Find literal text in scoped document contents. Returns excerpts and exact paths for further reads.",
        parameters: z.object({
            query: z.string().min(1).max(200),
            prefix: z.string(),
        }),
        execute: wrap("search_documents", async ({ query, prefix }) => {
            const docs = await workspace.list(options.scope, prefix);
            const matches = [];
            for (const meta of docs.filter((d) => !d.binary)) {
                const doc = await workspace.read(meta.path, options.scope);
                const at = doc.content
                    .toLocaleLowerCase()
                    .indexOf(query.toLocaleLowerCase());
                if (at >= 0)
                    matches.push({
                        path: meta.path,
                        revision: doc.meta.revision,
                        offset: at,
                        excerpt: doc.content.slice(
                            Math.max(0, at - 150),
                            at + 500,
                        ),
                    });
                if (matches.length >= 20) break;
            }
            return { matches, limited: matches.length >= 20 };
        }),
    });
    if (options.scope === "reader") return [read, list, search];
    return [
        read,
        list,
        search,
        tool({
            name: "diff",
            description:
                "List changes since the last successful Home run or previous diff in this run. Paginate until more=false. Read referenced versions for exact text. Cursor is acknowledged only on successful completion.",
            parameters: z.object({}),
            execute: wrap("diff", async () => {
                const result = await workspace.diff("home", cursor, 25);
                cursor = result.nextCursor;
                options.seen(cursor);
                return result;
            }),
        }),
        tool({
            name: "write_document",
            description:
                "Create/update Home profile, curriculum, observations, or plugin draft JSON. Read existing content first and provide expectedRevision (0 for a new file). Immutable evidence cannot be edited.",
            parameters: z.object({
                path: z.string(),
                content: z.string().max(100_000),
                expectedRevision: z.number().int().nonnegative(),
                immutable: z.boolean(),
            }),
            execute: wrap("write_document", async ({ immutable, ...write }) =>
                workspace.write(
                    { ...write, policy: immutable ? "immutable" : "mutable" },
                    "home",
                ),
            ),
        }),
        tool({
            name: "create_directory",
            description:
                "Organize a new Home observation category under home/observations.",
            parameters: z.object({ path: z.string() }),
            execute: wrap("create_directory", async ({ path }) =>
                workspace.mkdir(path, "home"),
            ),
        }),
        tool({
            name: "vocabulary_contract",
            description:
                "Read the exact vocabulary lesson schema, current ordered queue and target. Use before creating lesson drafts.",
            parameters: z.object({}),
            execute: wrap("vocabulary_contract", async () => ({
                schema: z.toJSONSchema(LessonDraftSchema),
                state: await workspace.mutate(async (tx) => {
                    const s = await tx.get(QUEUE_PATH, emptyQueue());
                    return {
                        revision: s.revision,
                        ready: s.ready,
                        activePlanId: s.active?.plan.planId ?? null,
                        completed: s.completed,
                    };
                }),
                config: await workspace.mutate((tx) =>
                    tx.get("_system/queue-config.json", DEFAULT_QUEUE_CONFIG),
                ),
            })),
        }),
        tool({
            name: "publish_document",
            description:
                "Validate a vocabulary draft, freeze it, and append it to the ready queue. Correct validation errors and retry. Idempotent for identical lesson content and source versions.",
            parameters: z.object({
                path: z.string(),
                expectedRevision: z.number().int().positive(),
            }),
            execute: wrap(
                "publish_document",
                async ({ path, expectedRevision }) =>
                    publishLesson(workspace, path, expectedRevision),
            ),
        }),
        tool({
            name: "revise_vocabulary_queue",
            description:
                "Reorder or supersede unstarted lessons. Include all IDs to retain, in desired order, and give an evidence-based reason. Active and completed lessons cannot be edited.",
            parameters: z.object({
                retainedPlanIds: z.array(z.string()),
                expectedRevision: z.number().int().nonnegative(),
                reason: z.string().min(1),
            }),
            execute: wrap(
                "revise_vocabulary_queue",
                async ({ retainedPlanIds, reason, expectedRevision }) =>
                    reviseQueue(
                        workspace,
                        retainedPlanIds,
                        reason,
                        expectedRevision,
                    ),
            ),
        }),
    ];
}
