import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspace } from "@/lib/runtime";
import { getDocument } from "@/lib/plugins/reading/documents";
import { body, failure } from "@/lib/http";
export async function POST(request: Request) {
    try {
        const input = z
            .object({
                id: z.string().uuid(),
                documentId: z.string(),
                startedAt: z.string().datetime(),
                visitedPages: z.array(z.string()).max(200),
            })
            .parse(await body(request));
        const ws = await getWorkspace();
        const doc = await getDocument(ws, input.documentId);
        const path = `plugins/reading/sessions/${input.id}.json`;
        await ws.mutate(async (tx) => {
            if (await tx.get(path, null)) return;
            tx.put({
                path,
                content: JSON.stringify(
                    {
                        ...input,
                        documentVersion: doc.version,
                        visitedPages: [
                            ...new Set(
                                input.visitedPages.filter((id) =>
                                    doc.pageIds.includes(id),
                                ),
                            ),
                        ],
                        endedAt: new Date().toISOString(),
                        interpretation:
                            "Reading activity only; no comprehension or mastery assessment. Page visibility is reported by the client.",
                    },
                    null,
                    2,
                ),
                policy: "immutable",
            });
        }, "reader");
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
