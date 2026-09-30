import { NextResponse } from "next/server";
import { FileCheckpointStore } from "@/lib/checkpoint";
import { AgentsTutor } from "@/lib/tutor";
import { SessionError, SessionService } from "@/lib/session-service";
import { CommandSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const shared = globalThis as typeof globalThis & {
    wordfieldService?: SessionService;
};
function service() {
    return (shared.wordfieldService ??= new SessionService(
        new FileCheckpointStore(),
        new AgentsTutor(),
        () => Boolean(process.env.OPENAI_API_KEY),
    ));
}
export async function GET() {
    try {
        return NextResponse.json(await service().get(), {
            headers: { "Cache-Control": "no-store" },
        });
    } catch {
        return NextResponse.json(
            {
                error: "The checkpoint could not be loaded. Check the local checkpoint file; it has not been overwritten.",
            },
            { status: 500 },
        );
    }
}
export async function POST(request: Request) {
    const origin = request.headers.get("origin");
    if (origin) {
        let sameOrigin = false;
        try {
            const parsed = new URL(origin);
            // Next may normalize request.url to localhost; Host preserves the browser's address.
            sameOrigin =
                ["http:", "https:"].includes(parsed.protocol) &&
                parsed.host ===
                    (request.headers.get("host") ?? new URL(request.url).host);
        } catch {
            /* Reject malformed and opaque origins. */
        }
        if (!sameOrigin)
            return NextResponse.json(
                { error: "Cross-origin requests are not allowed." },
                { status: 403 },
            );
    }
    let command;
    try {
        const raw = await request.text();
        if (raw.length > 20_000) throw new Error("Too large");
        command = CommandSchema.parse(JSON.parse(raw));
    } catch {
        return NextResponse.json(
            {
                error: "Check the request. Answers and learner descriptions must be 1–6,000 characters.",
            },
            { status: 400 },
        );
    }
    try {
        return NextResponse.json(await service().command(command));
    } catch (error) {
        if (error instanceof SessionError)
            return NextResponse.json(
                { error: error.message },
                { status: error.status },
            );
        return NextResponse.json(
            {
                error: "The checkpoint could not be updated. Your existing file has been preserved.",
            },
            { status: 500 },
        );
    }
}
