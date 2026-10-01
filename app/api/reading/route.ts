import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/runtime";
import { failure, checkOrigin } from "@/lib/http";
import { WorkspaceError } from "@/lib/workspace/files";
import {
    getDocument,
    getPages,
    importDocument,
    library,
} from "@/lib/plugins/reading/documents";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    try {
        const ws = await getWorkspace();
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return NextResponse.json({ documents: await library(ws) });
        const document = await getDocument(ws, id);
        return NextResponse.json({
            document,
            pages: await getPages(ws, document, document.pageIds),
        });
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    try {
        checkOrigin(request);
        if (Number(request.headers.get("content-length")) > 26 * 1024 * 1024)
            throw new WorkspaceError("Choose a file up to 25 MB.", 413);
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File))
            throw new WorkspaceError("Choose a document to upload.");
        return NextResponse.json(
            await importDocument(
                await getWorkspace(),
                Buffer.from(await file.arrayBuffer()),
                file.name,
            ),
        );
    } catch (error) {
        return failure(error);
    }
}
