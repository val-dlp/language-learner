import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getHome, getWorkspace, getRefill, getQuiz } from "@/lib/runtime";
import { body, failure } from "@/lib/http";
import { WorkspaceError } from "@/lib/workspace/files";
import {
    QUEUE_PATH,
    emptyQueue,
    DEFAULT_QUEUE_CONFIG,
    QueueConfigSchema,
} from "@/lib/plugins/vocabulary/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    try {
        const home = await getHome();
        after(async () => (await getRefill()).kick());
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
        if (new URL(request.url).searchParams.has("trace")) {
            await (await getQuiz()).expose();
            return NextResponse.json(await home.latest());
        }
        const latest = await home.latest();
        const workspace = await getWorkspace();
        const queue = await workspace.mutate((tx) =>
            tx.get(QUEUE_PATH, emptyQueue()),
        );
        return NextResponse.json({
            messages: await home.messages(),
            run: latest
                ? {
                      id: latest.id,
                      status: latest.status,
                      text: latest.text,
                      trigger: latest.trigger,
                      error: latest.error,
                      model: latest.model,
                      effort: latest.effort,
                  }
                : null,
            queue: {
                ready: queue.ready,
                activePlanId: queue.active?.plan.planId,
            },
            config: await workspace.mutate((tx) =>
                tx.get("_system/queue-config.json", DEFAULT_QUEUE_CONFIG),
            ),
            configured: Boolean(process.env.OPENAI_API_KEY),
            refill: await (await getRefill()).status(),
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
                z.object({ action: z.literal("retry_refill") }),
                z.object({ action: z.literal("cancel_refill") }),
                z.object({
                    action: z.literal("configure_queue"),
                    config: QueueConfigSchema,
                }),
            ])
            .parse(await body(request));
        const home = await getHome();
        if (input.action === "configure_queue") {
            await (
                await getWorkspace()
            ).write({
                path: "_system/queue-config.json",
                content: JSON.stringify(input.config),
            });
            return NextResponse.json({ ok: true });
        }
        if (input.action === "retry_refill") {
            await (await getRefill()).retry();
            after(async () => (await getRefill()).kick());
            return NextResponse.json({ ok: true });
        }
        if (input.action === "cancel_refill") {
            await (await getRefill()).cancel();
            return NextResponse.json({ ok: true });
        }
        if (input.action === "cancel") {
            if (home.current?.trigger === "queue_refill")
                await (await getRefill()).cancel();
            home.cancel();
            return NextResponse.json({ ok: true });
        }
        if (!process.env.OPENAI_API_KEY)
            throw new WorkspaceError(
                "Configure OPENAI_API_KEY in .env.local to use Home.",
                503,
            );
        const run = home.launch(input.message);
        after(async () => {
            await run.work;
            await (await getRefill()).kick();
        });
        return NextResponse.json({ runId: run.id });
    } catch (error) {
        return failure(error);
    }
}
