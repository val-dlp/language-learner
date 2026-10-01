import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { WorkspaceError } from "./workspace/files";
export function checkOrigin(request: Request) {
    const origin = request.headers.get("origin");
    if (!origin) return;
    try {
        const url = new URL(origin);
        if (
            ["http:", "https:"].includes(url.protocol) &&
            url.host ===
                (request.headers.get("host") ?? new URL(request.url).host)
        )
            return;
    } catch {}
    throw new WorkspaceError("Cross-origin requests are not allowed.", 403);
}
export async function body(request: Request, max = 250_000) {
    checkOrigin(request);
    const text = await request.text();
    if (text.length > max)
        throw new WorkspaceError("Request is too large.", 413);
    try {
        return JSON.parse(text);
    } catch {
        throw new WorkspaceError("Invalid JSON request.");
    }
}
export function failure(error: unknown) {
    if (error instanceof WorkspaceError)
        return NextResponse.json(
            { error: error.message },
            { status: error.status },
        );
    if (error instanceof ZodError)
        return NextResponse.json(
            {
                error: error.issues
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("; "),
            },
            { status: 400 },
        );
    return NextResponse.json(
        {
            error: "The operation could not be completed. Saved documents have been preserved.",
        },
        { status: 500 },
    );
}
