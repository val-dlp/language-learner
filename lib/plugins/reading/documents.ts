import { createHash } from "node:crypto";
import { WorkspaceError } from "@/lib/workspace/files";
import type { Workspace } from "@/lib/workspace/store";
export type TextBlock = { id: string; text: string };
export type TextPage = { id: string; number: number; blocks: TextBlock[] };
export type ReadingDocument = {
    id: string;
    version: string;
    title: string;
    filename: string;
    format: "pdf" | "txt" | "md";
    sourceUrl?: string;
    author?: string;
    edition?: string;
    importedAt: string;
    pageIds: string[];
    words: number;
    extractor: string;
};
const digest = (text: string | Buffer) =>
    createHash("sha256").update(text).digest("hex");
export function documentBase(id: string) {
    if (!/^[a-f0-9]{24}$/.test(id))
        throw new WorkspaceError("Invalid document ID.");
    return `plugins/reading/documents/${id}`;
}
export async function getDocument(ws: Workspace, id: string) {
    return JSON.parse(
        (await ws.read(`${documentBase(id)}/metadata.json`, "reader")).content,
    ) as ReadingDocument;
}
export async function getPages(
    ws: Workspace,
    doc: ReadingDocument,
    ids: string[],
) {
    if (ids.length > 200 || ids.some((id) => !doc.pageIds.includes(id)))
        throw new WorkspaceError("Page is outside this document.");
    return Promise.all(
        [...new Set(ids)].map(
            async (id) =>
                JSON.parse(
                    (
                        await ws.read(
                            `${documentBase(doc.id)}/pages/${id}.json`,
                            "reader",
                        )
                    ).content,
                ) as TextPage,
        ),
    );
}
export async function library(ws: Workspace) {
    const files = await ws.list("reader", "plugins/reading/documents");
    const docs = await Promise.all(
        files
            .filter((d) => d.path.endsWith("/metadata.json"))
            .map(
                async (d) =>
                    JSON.parse(
                        (await ws.read(d.path, "reader")).content,
                    ) as ReadingDocument,
            ),
    );
    return docs.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}
function page(number: number, paragraphs: string[]): TextPage {
    const id = `p${String(number).padStart(4, "0")}`;
    return {
        id,
        number,
        blocks: paragraphs
            .map((text) => text.replace(/\u0000/g, "").trim())
            .filter(Boolean)
            .map((text, i) => ({
                id: `${id}-b${String(i + 1).padStart(4, "0")}`,
                text,
            })),
    };
}
export async function extractText(
    bytes: Buffer,
    format: ReadingDocument["format"],
): Promise<TextPage[]> {
    if (format !== "pdf") {
        let text: string;
        try {
            text = new TextDecoder("utf-8", { fatal: true })
                .decode(bytes)
                .replace(/\r\n?/g, "\n");
        } catch {
            throw new WorkspaceError("Please upload text saved as UTF-8.");
        }
        const paragraphs = text
            .split(/\n\s*\n/)
            .flatMap((p) =>
                p.length > 3500 ? p.match(/[\s\S]{1,3500}/g)! : [p],
            );
        const pages: TextPage[] = [];
        let current: string[] = [],
            length = 0;
        for (const paragraph of paragraphs) {
            if (length + paragraph.length > 4500 && current.length) {
                pages.push(page(pages.length + 1, current));
                current = [];
                length = 0;
            }
            current.push(paragraph);
            length += paragraph.length;
        }
        if (current.length) pages.push(page(pages.length + 1, current));
        return pages;
    }
    if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
        throw new WorkspaceError("This file does not appear to be a PDF.");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: true,
        disableFontFace: true,
    });
    try {
        const pdf = await task.promise;
        if (pdf.numPages > 200)
            throw new WorkspaceError("Choose a PDF with at most 200 pages.");
        const pages: TextPage[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
            const p = await pdf.getPage(n);
            const content = await p.getTextContent();
            const lines: { text: string; y: number; height: number }[] = [];
            let line = "",
                previousY: number | null = null,
                lineHeight = 12,
                previousEnd = 0;
            for (const item of content.items) {
                if (!("str" in item)) continue;
                const y = item.transform[5];
                if (
                    previousY !== null &&
                    Math.abs(y - previousY) > Math.max(3, lineHeight * 0.5) &&
                    line.trim()
                ) {
                    lines.push({
                        text: line.trim(),
                        y: previousY,
                        height: lineHeight,
                    });
                    line = "";
                }
                // PDF.js often splits a single word into several drawing operations.
                // Infer a space only from a real horizontal gap, never from item boundaries.
                if (
                    line &&
                    !/\s$/.test(line) &&
                    !/^\s/.test(item.str) &&
                    item.transform[4] - previousEnd > lineHeight * 0.15
                )
                    line += " ";
                line += item.str;
                previousEnd = item.transform[4] + item.width;
                previousY = y;
                lineHeight = item.height || lineHeight;
                if (item.hasEOL && line.trim()) {
                    lines.push({ text: line.trim(), y, height: lineHeight });
                    line = "";
                }
            }
            if (line.trim())
                lines.push({
                    text: line.trim(),
                    y: previousY ?? 0,
                    height: lineHeight,
                });
            const paragraphs: string[] = [];
            let paragraph = "";
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i],
                    prev = lines[i - 1];
                if (
                    prev &&
                    (Math.abs(prev.y - line.y) >
                        Math.max(prev.height, line.height) * 1.7 ||
                        paragraph.length > 1800)
                ) {
                    paragraphs.push(paragraph);
                    paragraph = "";
                }
                paragraph += (paragraph ? " " : "") + line.text;
            }
            if (paragraph) paragraphs.push(paragraph);
            pages.push(page(n, paragraphs));
            p.cleanup();
        }
        return pages;
    } catch (error) {
        if (error instanceof WorkspaceError) throw error;
        throw new WorkspaceError(
            "This PDF could not be read. Use an unencrypted PDF with selectable text.",
        );
    } finally {
        await task.destroy();
    }
}
export async function importDocument(
    ws: Workspace,
    bytes: Buffer,
    filename: string,
    details: {
        title?: string;
        sourceUrl?: string;
        author?: string;
        edition?: string;
    } = {},
) {
    if (!bytes.length || bytes.length > 25 * 1024 * 1024)
        throw new WorkspaceError("Choose a non-empty file up to 25 MB.");
    const extension = filename.split(".").at(-1)?.toLowerCase();
    if (!["pdf", "txt", "md"].includes(extension ?? ""))
        throw new WorkspaceError("Choose a PDF, TXT, or Markdown file.");
    const format = extension as ReadingDocument["format"];
    const extractor = "wordfield-text-v1";
    const id = digest(
        Buffer.concat([Buffer.from(`${extractor}:${format}:`), bytes]),
    ).slice(0, 24);
    const base = documentBase(id);
    const existing = await ws.mutate((tx) =>
        tx.get<ReadingDocument | null>(`${base}/metadata.json`, null),
    );
    if (existing) return existing;
    const pages = await extractText(bytes, format);
    const text = pages.flatMap((p) => p.blocks.map((b) => b.text)).join(" ");
    if (!text.trim())
        throw new WorkspaceError(
            "No readable text was found. Scanned documents need OCR, which is not supported yet.",
        );
    if (pages.length > 200 || text.length > 2_000_000)
        throw new WorkspaceError(
            "This document is too large. Choose up to 200 pages or 2 million text characters.",
        );
    const metadata: ReadingDocument = {
        id,
        version: digest(JSON.stringify(pages)),
        title: details.title || filename.replace(/\.[^.]+$/, ""),
        filename,
        format,
        ...details,
        importedAt: new Date().toISOString(),
        pageIds: pages.map((p) => p.id),
        words: text.split(/\s+/).length,
        extractor,
    };
    return ws.mutate(async (tx) => {
        const existing = await tx.get<ReadingDocument | null>(
            `${base}/metadata.json`,
            null,
        );
        if (existing) return existing;
        tx.put({
            path: `${base}/source.${format}`,
            content: bytes,
            policy: "immutable",
            educational: false,
        });
        tx.put({
            path: `${base}/metadata.json`,
            content: JSON.stringify(metadata, null, 2),
            policy: "immutable",
        });
        for (const p of pages)
            tx.put({
                path: `${base}/pages/${p.id}.json`,
                content: JSON.stringify(p, null, 2),
                policy: "immutable",
            });
        return metadata;
    }, "reading-import");
}
