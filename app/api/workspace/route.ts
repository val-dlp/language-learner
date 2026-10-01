import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspace, getQuiz } from "@/lib/runtime";
import { body, failure } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    try {
        const workspace = await getWorkspace();
        const url = new URL(request.url);
        const path = url.searchParams.get("path");
        const revision = url.searchParams.get("revision");
        if (
            path &&
            (path.startsWith("plugins/vocabulary/") ||
                path.startsWith("_system/"))
        )
            await (await getQuiz()).expose();
        return NextResponse.json(
            path
                ? await workspace.read(
                      path,
                      "app",
                      revision ? Number(revision) : undefined,
                  )
                : await workspace.list(),
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    try {
        const input = z
            .object({
                path: z.string(),
                content: z.string().max(100_000),
                expectedRevision: z.number().int().nonnegative(),
            })
            .parse(await body(request));
        return NextResponse.json(
            await (await getWorkspace()).write(input, "user"),
        );
    } catch (error) {
        return failure(error);
    }
}
