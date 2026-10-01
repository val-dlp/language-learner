import { NextResponse } from "next/server";
import { getReader, getWorkspace } from "@/lib/runtime";
import {
    ReaderRequestSchema,
    threads,
    messages,
} from "@/lib/plugins/reading/assistant";
import { body, failure } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    try {
        const query = new URL(request.url).searchParams;
        const docId = query.get("documentId") || "",
            threadId = query.get("threadId");
        const ws = await getWorkspace();
        return NextResponse.json(
            threadId
                ? { messages: await messages(ws, docId, threadId) }
                : { threads: await threads(ws, docId) },
        );
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    try {
        const input = ReaderRequestSchema.parse(await body(request));
        const reader = await getReader();
        const controller = new AbortController();
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(output) {
                const emit = (event: unknown) => {
                    if (!controller.signal.aborted) {
                        try {
                            output.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify(event)}\n\n`,
                                ),
                            );
                        } catch {
                            controller.abort();
                        }
                    }
                };
                try {
                    await reader.chat(
                        input,
                        AbortSignal.any([request.signal, controller.signal]),
                        emit,
                    );
                } catch (error) {
                    emit({
                        type: "error",
                        error:
                            error instanceof Error
                                ? error.message
                                : "The discussion could not start.",
                    });
                } finally {
                    try {
                        output.close();
                    } catch {}
                }
            },
            cancel() {
                controller.abort();
            },
        });
        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
            },
        });
    } catch (error) {
        return failure(error);
    }
}
