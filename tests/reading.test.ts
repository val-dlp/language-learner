import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RunContext } from "@openai/agents";
import { Workspace } from "@/lib/workspace/store";
import { bootstrap } from "@/lib/workspace/bootstrap";
import { getPages, importDocument } from "@/lib/plugins/reading/documents";
import {
    ReaderService,
    messages,
    threads,
    validateAnchor,
    type Anchor,
} from "@/lib/plugins/reading/assistant";
const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0))
        await rm(root, { recursive: true, force: true });
});
async function setup() {
    const root = await mkdtemp(path.join(os.tmpdir(), "wordfield-reader-"));
    roots.push(root);
    const ws = new Workspace(root);
    await bootstrap(ws, root);
    const doc = await importDocument(
        ws,
        Buffer.from(
            "La niña llegó al jardín.\n\n¿Dónde está la tortuga?\n\n" +
                "Otro párrafo. ".repeat(700),
        ),
        "cuento.txt",
    );
    const pages = await getPages(ws, doc, doc.pageIds);
    const anchor: Anchor = {
        documentId: doc.id,
        version: doc.version,
        kind: "selection",
        ranges: [
            {
                pageId: pages[0].id,
                blockId: pages[0].blocks[0].id,
                start: 3,
                end: 7,
                quote: "niña",
            },
        ],
    };
    return { ws, doc, pages, anchor };
}
it("preserves accents and stable extraction IDs; rejects fabricated anchors and paths", async () => {
    const { ws, doc, pages, anchor } = await setup();
    expect(pages[0].blocks[0].text).toBe("La niña llegó al jardín.");
    expect((await getPages(ws, doc, doc.pageIds))[0].blocks[0].id).toBe(
        pages[0].blocks[0].id,
    );
    expect(await validateAnchor(ws, doc, anchor)).toEqual(anchor);
    await expect(
        validateAnchor(ws, doc, {
            ...anchor,
            ranges: [{ ...anchor.ranges[0], quote: "fake" }],
        }),
    ).rejects.toThrow("does not match");
    await expect(getPages(ws, doc, ["../../home/profile.md"])).rejects.toThrow(
        "outside",
    );
    await expect(
        importDocument(ws, Buffer.from("hi"), "a.exe"),
    ).rejects.toThrow("Choose a PDF");
    await expect(
        importDocument(ws, Buffer.from(""), "empty.txt"),
    ).rejects.toThrow("non-empty");
});
it("saves exact send-time pages, persists anchored threads, and restricts reader tools", async () => {
    const { ws, doc, pages, anchor } = await setup();
    let context: any;
    const service = new ReaderService(ws, async (input) => {
        context = JSON.parse(input.input);
        expect(input.tools.some((t) => t.name === "write_document")).toBe(
            false,
        );
        const read = input.tools.find((t) => t.name === "read_document")!;
        const result = await read.invoke(
            new RunContext(undefined),
            JSON.stringify({
                path: "plugins/vocabulary/plans/secret.json",
                revision: null,
                offset: 0,
                length: 1000,
            }),
        );
        expect(JSON.stringify(result)).toContain("scope");
        input.onText("It means girl.");
        return { text: "It means girl.", usage: null };
    });
    const events: any[] = [],
        requestId = crypto.randomUUID();
    await service.chat(
        {
            documentId: doc.id,
            threadId: null,
            requestId,
            anchor,
            visiblePages: [pages[0].id],
            message: "What is niña?",
        },
        new AbortController().signal,
        (e) => events.push(e),
    );
    expect(context.visiblePages.map((p: any) => p.id)).toEqual([pages[0].id]);
    expect(context.anchor.ranges[0].quote).toBe("niña");
    const saved = (await threads(ws, doc.id))[0];
    expect(saved.anchor).toEqual(anchor);
    const transcript = await messages(ws, doc.id, saved.id);
    expect(transcript).toHaveLength(2);
    expect(transcript[0].text).toBe("What is niña?");
    expect(transcript[0].context).toEqual(context);
    expect(events.at(-1).type).toBe("done");
    await service.chat(
        {
            documentId: doc.id,
            threadId: null,
            requestId,
            anchor,
            visiblePages: [],
            message: "duplicate",
        },
        new AbortController().signal,
        (e) => events.push(e),
    );
    expect(await messages(ws, doc.id, saved.id)).toHaveLength(2);
    expect(events.at(-1).type).toBe("error");
});
it("preserves a question but never appends a cancelled model response", async () => {
    const { ws, doc, anchor } = await setup();
    const controller = new AbortController();
    const reader = new ReaderService(ws, async () => {
        controller.abort();
        return { text: "late", usage: null };
    });
    await reader.chat(
        {
            documentId: doc.id,
            requestId: crypto.randomUUID(),
            threadId: null,
            anchor,
            visiblePages: [],
            message: "Hello",
        },
        controller.signal,
        () => {},
    );
    const thread = (await threads(ws, doc.id))[0];
    expect((await messages(ws, doc.id, thread.id)).map((m) => m.role)).toEqual([
        "user",
    ]);
});
