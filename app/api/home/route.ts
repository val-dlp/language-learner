import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getHome, getWorkspace } from "@/lib/runtime";
import { body, failure } from "@/lib/http";
import { WorkspaceError } from "@/lib/workspace/files";
import {
    QUEUE_PATH,
    emptyQueue,
    DEFAULT_QUEUE_CONFIG,
} from "@/lib/plugins/vocabulary/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    try {
        const home = await getHome();
        if (new URL(request.url).searchParams.has("events")) {
            let unsubscribe = () => {};
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    unsubscribe = home.subscribe((run) => {
                        try {
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify(run ? { id: run.id, status: run.status, text: run.text, trigger: run.trigger, error: run.error, tool: run.tools.at(-1)?.name } : null)}\n\n`,
                                ),
                            );
                        } catch {
                            unsubscribe();
                        }
                    });
                    request.signal.addEventListener(
                        "abort",
                        () => {
                            unsubscribe();
                            try {
                                controller.close();
                            } catch {}
                        },
                        { once: true },
                    );
                },
                cancel() {
                    unsubscribe();
                },
            });
            return new Response(stream, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache, no-transform",
                    Connection: "keep-alive",
                },
            });
        }
        const workspace = await getWorkspace();
        const queue = await workspace.mutate((tx) =>
            tx.get(QUEUE_PATH, emptyQueue()),
        );
        return NextResponse.json({
            messages: await home.messages(),
            run: await home.latest(),
            queue: {
                ready: queue.ready,
                activePlanId: queue.active?.plan.planId,
            },
            config: await workspace.mutate((tx) =>
                tx.get("_system/queue-config.json", DEFAULT_QUEUE_CONFIG),
            ),
            configured: Boolean(process.env.OPENAI_API_KEY),
        });
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    try {
        const input = z
            .discriminatedUnion("action", [
                z.object({
                    action: z.literal("message"),
                    message: z.string().trim().min(1).max(12000),
                }),
                z.object({ action: z.literal("cancel") }),
            ])
            .parse(await body(request));
        const home = await getHome();
        if (input.action === "cancel") {
            home.cancel();
            return NextResponse.json({ ok: true });
        }
        if (!process.env.OPENAI_API_KEY)
            throw new WorkspaceError(
                "Configure OPENAI_API_KEY in .env.local to use Home.",
                503,
            );
        const run = home.launch(input.message);
        after(() => run.work.then(() => {}));
        return NextResponse.json({ runId: run.id });
    } catch (error) {
        return failure(error);
    }
}
