import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/runtime";
import { checkOrigin, failure } from "@/lib/http";
import { importDocument } from "@/lib/plugins/reading/documents";
import { WorkspaceError } from "@/lib/workspace/files";
export const runtime = "nodejs";
// Fixed, public sources. The endpoint cannot fetch arbitrary agent/user URLs.
const samples = [
    { title: "La tortuga gigante", slug: "la-tortuga-gigante" },
    { title: "El almohadón de pluma", slug: "el-almohadon-de-pluma" },
];
export async function POST(request: Request) {
    try {
        checkOrigin(request);
        const workspace = await getWorkspace();
        const imported = [];
        for (const sample of samples) {
            const sourceUrl = `https://www.textos.info/horacio-quiroga/${sample.slug}/pdf`;
            const response = await fetch(sourceUrl, {
                signal: AbortSignal.timeout(45_000),
            });
            if (!response.ok)
                throw new WorkspaceError(
                    "The sample publisher could not be reached. Try again or upload a PDF.",
                    502,
                );
            imported.push(
                await importDocument(
                    workspace,
                    Buffer.from(await response.arrayBuffer()),
                    `${sample.slug}.pdf`,
                    {
                        title: sample.title,
                        author: "Horacio Quiroga",
                        sourceUrl,
                        edition:
                            "Digital edition by textos.info / Edu Robsy. Downloaded for local reading; source files are not distributed in the repository. See original PDF for edition details.",
                    },
                ),
            );
        }
        return NextResponse.json({ documents: imported });
    } catch (error) {
        return failure(error);
    }
}
