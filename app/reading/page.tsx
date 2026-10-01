"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowUp,
    BookOpen,
    MessageCircle,
    Plus,
    Square,
    Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import type {
    ReadingDocument,
    TextPage,
} from "@/lib/plugins/reading/documents";
import type {
    Anchor,
    ReadingThread,
    ReaderMessage,
} from "@/lib/plugins/reading/assistant";
async function json(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
}
export default function Reading() {
    const [library, setLibrary] = useState<ReadingDocument[]>([]);
    const [doc, setDoc] = useState<ReadingDocument | null>(null);
    const [pages, setPages] = useState<TextPage[]>([]);
    const [threads, setThreads] = useState<ReadingThread[]>([]);
    const [thread, setThread] = useState<ReadingThread | null>(null);
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const [selection, setSelection] = useState<Anchor | null>(null);
    const [messages, setMessages] = useState<ReaderMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [partial, setPartial] = useState("");
    const [busy, setBusy] = useState(false),
        [uploading, setUploading] = useState(false),
        [opening, setOpening] = useState(false);
    const [error, setError] = useState(""),
        [status, setStatus] = useState("");
    const [visible, setVisible] = useState<string[]>([]);
    const reader = useRef<HTMLDivElement>(null),
        end = useRef<HTMLDivElement>(null);
    const controller = useRef<AbortController | null>(null);
    const activity = useRef({
        id: "",
        startedAt: "",
        visited: new Set<string>(),
    });
    const refreshLibrary = useCallback(
        async () => setLibrary((await json("/api/reading")).documents),
        [],
    );
    useEffect(() => {
        refreshLibrary().catch((e) => setError(e.message));
        return () => controller.current?.abort();
    }, [refreshLibrary]);
    useEffect(() => {
        const root = reader.current;
        if (!root || !pages.length) return;
        const inView = new Set<string>();
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const id = (entry.target as HTMLElement).dataset.pageId!;
                    if (entry.isIntersecting) {
                        inView.add(id);
                        activity.current.visited.add(id);
                    } else inView.delete(id);
                }
                setVisible([...inView].sort());
            },
            { root, threshold: 0.01 },
        );
        root.querySelectorAll("[data-page-id]").forEach((el) =>
            observer.observe(el),
        );
        return () => observer.disconnect();
    }, [pages]);
    useEffect(() => {
        end.current?.scrollIntoView({ block: "nearest" });
    }, [partial, messages.length]);
    async function openDocument(id: string) {
        setOpening(true);
        setError("");
        try {
            const [data, chats] = await Promise.all([
                json(`/api/reading?id=${id}`),
                json(`/api/reading/chat?documentId=${id}`),
            ]);
            setDoc(data.document);
            setPages(data.pages);
            setThreads(chats.threads);
            setThread(null);
            setMessages([]);
            setAnchor(null);
            setSelection(null);
            setPartial("");
            setDraft("");
            setVisible([]);
            activity.current = {
                id: crypto.randomUUID(),
                startedAt: new Date().toISOString(),
                visited: new Set(),
            };
        } catch (e) {
            setError(String(e));
        } finally {
            setOpening(false);
        }
    }
    async function seed() {
        setUploading(true);
        setError("");
        try {
            await json("/api/reading/seed", { method: "POST" });
            await refreshLibrary();
        } catch (e) {
            setError(String(e));
        } finally {
            setUploading(false);
        }
    }
    async function upload(file: File) {
        setUploading(true);
        setError("");
        try {
            const form = new FormData();
            form.set("file", file);
            const data = await json("/api/reading", {
                method: "POST",
                body: form,
            });
            await refreshLibrary();
            await openDocument(data.id);
        } catch (e) {
            setError(String(e));
        } finally {
            setUploading(false);
        }
    }
    function newDiscussion(next: Anchor | null) {
        setThread(null);
        setMessages([]);
        setAnchor(next);
        setSelection(null);
        setPartial("");
        setError("");
    }
    async function openThread(next: ReadingThread) {
        if (!doc || busy) return;
        try {
            const data = await json(
                `/api/reading/chat?documentId=${doc.id}&threadId=${next.id}`,
            );
            setThread(next);
            setAnchor(next.anchor);
            setMessages(data.messages);
            setPartial("");
            setSelection(null);
            const block = next.anchor.ranges[0]?.blockId;
            if (block)
                document
                    .getElementById(block)
                    ?.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch (e) {
            setError(String(e));
        }
    }
    function selectPassage() {
        if (!doc || busy) return;
        const selected = window.getSelection();
        if (!selected || selected.isCollapsed || !selected.rangeCount) {
            setSelection(null);
            return;
        }
        const range = selected.getRangeAt(0),
            root = reader.current;
        if (!root || !root.contains(range.commonAncestorContainer)) return;
        const ranges: Anchor["ranges"] = [];
        root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
            if (!range.intersectsNode(el)) return;
            const part = range.cloneRange();
            if (!el.contains(part.startContainer)) part.setStart(el, 0);
            if (!el.contains(part.endContainer))
                part.setEnd(el, el.childNodes.length);
            const prefix = document.createRange();
            prefix.selectNodeContents(el);
            prefix.setEnd(part.startContainer, part.startOffset);
            const start = prefix.toString().length,
                quote = part.toString();
            if (quote)
                ranges.push({
                    pageId: el.closest<HTMLElement>("[data-page-id]")!.dataset
                        .pageId!,
                    blockId: el.dataset.blockId!,
                    start,
                    end: start + quote.length,
                    quote,
                });
        });
        if (ranges.length)
            setSelection({
                kind: "selection",
                documentId: doc.id,
                version: doc.version,
                ranges,
            });
    }
    async function send() {
        if (!doc || !draft.trim() || busy) return;
        const sentText = draft;
        const sentAnchor: Anchor = anchor || {
            kind: "document",
            documentId: doc.id,
            version: doc.version,
            ranges: [],
        };
        const requestId = crypto.randomUUID(),
            abort = new AbortController();
        controller.current = abort;
        setBusy(true);
        setError("");
        setStatus("Reading your passage…");
        setPartial("");
        setDraft("");
        let currentThreadId = thread?.id || null;
        try {
            const response = await fetch("/api/reading/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    documentId: doc.id,
                    threadId: currentThreadId,
                    requestId,
                    anchor: sentAnchor,
                    visiblePages: visible.slice(0, 8),
                    message: sentText,
                }),
                signal: abort.signal,
            });
            if (!response.ok) throw new Error((await response.json()).error);
            const stream = response.body!.getReader(),
                decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const next = await stream.read();
                buffer += decoder.decode(next.value, { stream: !next.done });
                let boundary: number;
                while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                    const line = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    if (!line.startsWith("data: ")) continue;
                    const event = JSON.parse(line.slice(6));
                    if (event.type === "thread") {
                        currentThreadId = event.thread.id;
                        setThread(event.thread);
                        setAnchor(event.thread.anchor);
                        setMessages((previous) => [
                            ...previous,
                            {
                                id: requestId,
                                role: "user",
                                text: sentText,
                                createdAt: new Date().toISOString(),
                                context: null,
                                runId: "",
                            },
                        ]);
                        setThreads((previous) =>
                            previous.some((t) => t.id === event.thread.id)
                                ? previous
                                : [...previous, event.thread],
                        );
                    } else if (event.type === "delta")
                        setPartial((previous) => previous + event.text);
                    else if (event.type === "tool")
                        setStatus(`Reading more context…`);
                    else if (event.type === "error") setError(event.error);
                    else if (event.type === "done") {
                        setPartial("");
                        setMessages((previous) => [...previous, event.message]);
                    }
                }
                if (next.done) break;
            }
        } catch (e) {
            if (!abort.signal.aborted) setError(String(e));
            else
                setError(
                    "Response stopped. Your question remains in the discussion.",
                );
        } finally {
            setBusy(false);
            setStatus("");
            setPartial("");
            controller.current = null;
            if (currentThreadId)
                json(
                    `/api/reading/chat?documentId=${doc.id}&threadId=${currentThreadId}`,
                )
                    .then((data) => setMessages(data.messages))
                    .catch(() => {});
        }
    }
    async function finishReading() {
        if (!doc) return;
        try {
            await json("/api/reading/activity", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: activity.current.id,
                    startedAt: activity.current.startedAt,
                    documentId: doc.id,
                    visitedPages: [...activity.current.visited],
                }),
            });
            setDoc(null);
            setPages([]);
            setError("");
        } catch (e) {
            setError(String(e));
        }
    }
    return (
        <main className="py-8">
            {!doc ? (
                <>
                    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
                        <div>
                            <p className="eyebrow mb-2">
                                Practice at your own pace
                            </p>
                            <h1 className="serif text-4xl">
                                Your reading room
                            </h1>
                            <p className="mt-3 text-sm text-stone-500">
                                Bring a text. Explore a passage. Keep the
                                conversation beside it.
                            </p>
                        </div>
                        <label
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-medium text-white ${uploading ? "opacity-50" : "hover:bg-teal-800"}`}
                        >
                            <Upload size={16} />
                            {uploading ? "Importing…" : "Add a document"}
                            <input
                                type="file"
                                className="sr-only"
                                accept=".pdf,.txt,.md"
                                disabled={uploading}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) upload(file);
                                    e.target.value = "";
                                }}
                            />
                        </label>
                    </div>
                    {error && (
                        <p role="alert" className="notice mb-5">
                            {error}
                        </p>
                    )}
                    <p className="mb-6 text-xs text-stone-400">
                        PDF, text, or Markdown · Up to 25 MB and 200 pages ·
                        Selectable text only
                    </p>
                    <Button
                        className="mb-6"
                        variant="outline"
                        size="sm"
                        disabled={uploading}
                        onClick={seed}
                    >
                        {uploading ? "Importing…" : "Add sample stories"}
                    </Button>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {library.map((d) => (
                            <button
                                key={d.id}
                                disabled={opening}
                                className="panel group p-7 text-left transition-colors hover:border-teal-500"
                                onClick={() => openDocument(d.id)}
                            >
                                <div className="mb-8 flex justify-between">
                                    <BookOpen
                                        className="text-teal-700"
                                        size={25}
                                    />
                                    <span className="rounded-md bg-stone-100 px-2 py-1 text-[10px] uppercase tracking-wide text-stone-500">
                                        {d.format}
                                    </span>
                                </div>
                                <h2 className="serif text-2xl leading-snug">
                                    {d.title}
                                </h2>
                                <p className="mt-3 text-sm text-stone-500">
                                    {d.author || "Your document"}
                                </p>
                                <p className="mt-6 text-xs text-stone-400">
                                    {d.pageIds.length}{" "}
                                    {d.format === "pdf" ? "pages" : "sections"}{" "}
                                    · {d.words.toLocaleString()} words
                                </p>
                            </button>
                        ))}
                    </div>
                    {!library.length && (
                        <section className="panel p-10 text-center">
                            <BookOpen className="mx-auto mb-4 text-teal-700" />
                            <h2 className="serif mb-3 text-2xl">
                                Make room for a good story.
                            </h2>
                            <p className="text-sm text-stone-500">
                                Add your first Spanish document to begin.
                            </p>
                        </section>
                    )}
                </>
            ) : (
                <>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                    setDoc(null);
                                    setPages([]);
                                }}
                                aria-label="Back to reading library"
                            >
                                <ArrowLeft size={18} />
                            </Button>
                            <div>
                                <h1 className="serif text-2xl">{doc.title}</h1>
                                <p className="mt-1 text-xs text-stone-500">
                                    {doc.author ? `${doc.author} · ` : ""}
                                    {doc.pageIds.length}{" "}
                                    {doc.format === "pdf"
                                        ? "pages"
                                        : "sections"}
                                    {doc.sourceUrl && (
                                        <>
                                            {" "}
                                            ·{" "}
                                            <a
                                                href={doc.sourceUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="underline"
                                            >
                                                Original source ↗
                                            </a>
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={finishReading}
                        >
                            Finish reading & save activity
                        </Button>
                    </div>
                    {error && (
                        <p role="alert" className="notice mb-4">
                            {error}
                        </p>
                    )}
                    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
                        <section className="panel overflow-hidden">
                            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-stone-100 px-5 py-3">
                                <p className="text-xs text-stone-500">
                                    Highlight a passage or use + beside a
                                    paragraph.
                                </p>
                                <select
                                    aria-label="Go to page"
                                    className="max-w-28 rounded border border-stone-200 bg-white p-1 text-xs"
                                    value={visible[0] || pages[0]?.id || ""}
                                    onChange={(e) =>
                                        document
                                            .getElementById(
                                                `page-${e.target.value}`,
                                            )
                                            ?.scrollIntoView({ block: "start" })
                                    }
                                >
                                    {pages.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {doc.format === "pdf"
                                                ? "Page"
                                                : "Section"}{" "}
                                            {p.number}
                                        </option>
                                    ))}
                                </select>
                                {selection && (
                                    <Button
                                        size="sm"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => newDiscussion(selection)}
                                    >
                                        Discuss selection
                                    </Button>
                                )}
                            </div>
                            <div
                                ref={reader}
                                className="reader-pages max-h-[76vh] overflow-y-auto px-6 md:px-10"
                                onMouseUp={selectPassage}
                                onKeyUp={selectPassage}
                                onTouchEnd={selectPassage}
                            >
                                {pages.map((p) => (
                                    <article
                                        key={p.id}
                                        id={`page-${p.id}`}
                                        data-page-id={p.id}
                                        className="border-b border-stone-100 py-9"
                                    >
                                        <p className="mb-7 text-center text-[10px] uppercase tracking-[.2em] text-stone-400">
                                            {doc.format === "pdf"
                                                ? "Page"
                                                : "Section"}{" "}
                                            {p.number}
                                        </p>
                                        {p.blocks.length ? (
                                            p.blocks.map((b) => {
                                                const comments = threads.filter(
                                                    (t) =>
                                                        t.anchor.ranges[0]
                                                            ?.blockId === b.id,
                                                );
                                                return (
                                                    <div
                                                        key={b.id}
                                                        className="group relative pr-8"
                                                    >
                                                        <p
                                                            id={b.id}
                                                            data-block-id={b.id}
                                                            className={`serif mb-5 whitespace-pre-wrap text-lg leading-[1.95] ${anchor?.ranges.some((r) => r.blockId === b.id) ? "rounded bg-[#f0f5df]" : ""}`}
                                                        >
                                                            {b.text}
                                                        </p>
                                                        <div className="absolute -right-3 top-0 flex flex-col gap-1">
                                                            {comments.map(
                                                                (t, i) => (
                                                                    <button
                                                                        key={
                                                                            t.id
                                                                        }
                                                                        disabled={
                                                                            busy
                                                                        }
                                                                        aria-label={`Open discussion ${i + 1} at this paragraph`}
                                                                        title={
                                                                            t.anchor.ranges
                                                                                .map(
                                                                                    (
                                                                                        r,
                                                                                    ) =>
                                                                                        r.quote,
                                                                                )
                                                                                .join(
                                                                                    " ",
                                                                                )
                                                                                .slice(
                                                                                    0,
                                                                                    120,
                                                                                ) ||
                                                                            "Paragraph discussion"
                                                                        }
                                                                        className="rounded-full bg-teal-100 p-1.5 text-teal-800 hover:bg-teal-200"
                                                                        onClick={() =>
                                                                            openThread(
                                                                                t,
                                                                            )
                                                                        }
                                                                    >
                                                                        <MessageCircle
                                                                            size={
                                                                                13
                                                                            }
                                                                        />
                                                                    </button>
                                                                ),
                                                            )}
                                                            <button
                                                                disabled={busy}
                                                                aria-label={`Discuss paragraph ${b.id}`}
                                                                className="rounded-full border border-stone-200 bg-white p-1.5 text-stone-400 opacity-60 hover:text-teal-800 focus:opacity-100 group-hover:opacity-100"
                                                                onClick={() =>
                                                                    newDiscussion(
                                                                        {
                                                                            kind: "paragraph",
                                                                            documentId:
                                                                                doc.id,
                                                                            version:
                                                                                doc.version,
                                                                            ranges: [
                                                                                {
                                                                                    pageId: p.id,
                                                                                    blockId:
                                                                                        b.id,
                                                                                    start: 0,
                                                                                    end: 0,
                                                                                    quote: "",
                                                                                },
                                                                            ],
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                <Plus
                                                                    size={13}
                                                                />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <p className="text-center text-sm italic text-stone-400">
                                                No text on this source page.
                                            </p>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </section>
                        <aside className="panel flex min-h-[550px] flex-col overflow-hidden lg:sticky lg:top-5">
                            <div className="flex items-center justify-between border-b border-stone-100 p-4">
                                <h2 className="text-sm font-semibold">
                                    Reading companion
                                </h2>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => newDiscussion(null)}
                                >
                                    <Plus size={14} /> New chat
                                </Button>
                            </div>
                            {threads.length > 0 && (
                                <select
                                    aria-label="Saved discussions"
                                    className="m-4 mb-0 rounded-lg border border-stone-200 bg-white p-2 text-xs"
                                    value={thread?.id || ""}
                                    disabled={busy}
                                    onChange={(e) => {
                                        const t = threads.find(
                                            (t) => t.id === e.target.value,
                                        );
                                        if (t) openThread(t);
                                    }}
                                >
                                    <option value="">New discussion</option>
                                    {threads.map((t, i) => (
                                        <option key={t.id} value={t.id}>
                                            {t.anchor.kind === "document"
                                                ? "Document discussion"
                                                : t.anchor.ranges
                                                      .map((r) => r.quote)
                                                      .join(" ")
                                                      .slice(0, 60) ||
                                                  `Paragraph discussion ${i + 1}`}
                                        </option>
                                    ))}
                                </select>
                            )}
                            {anchor && anchor.kind !== "document" && (
                                <div className="mx-4 mt-4 max-h-28 overflow-auto rounded-lg bg-[#f0f5df] px-3 py-2 text-xs leading-6">
                                    <p className="font-medium text-teal-800">
                                        {anchor.kind === "selection"
                                            ? "Selected passage"
                                            : "Paragraph discussion"}
                                    </p>
                                    {anchor.ranges
                                        .map((r) => r.quote)
                                        .join(" … ") ||
                                        "This chat stays attached to the paragraph."}
                                </div>
                            )}
                            <div className="max-h-[45vh] min-h-56 flex-1 space-y-5 overflow-y-auto p-5">
                                {!messages.length && !partial && (
                                    <div className="py-6">
                                        <BookOpen
                                            size={22}
                                            className="mb-4 text-teal-700"
                                        />
                                        <h3 className="serif text-xl">
                                            Read with a little company.
                                        </h3>
                                        <p className="mt-3 text-sm leading-7 text-stone-500">
                                            Ask about an expression, discuss a
                                            character, or try explaining a
                                            passage in your own words. I can see
                                            the pages you’re viewing when you
                                            send.
                                        </p>
                                    </div>
                                )}
                                {messages.map((m) => (
                                    <article
                                        key={m.id}
                                        className={
                                            m.role === "user"
                                                ? "ml-4 rounded-xl bg-stone-100 p-3"
                                                : ""
                                        }
                                    >
                                        <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-400">
                                            {m.role === "user"
                                                ? "You"
                                                : "Reading companion"}
                                        </p>
                                        <Markdown text={m.text} />
                                    </article>
                                ))}
                                {partial && <Markdown text={partial} />}{" "}
                                {busy && (
                                    <p
                                        role="status"
                                        className="text-xs text-teal-700"
                                    >
                                        {status}
                                    </p>
                                )}
                                <div ref={end} />
                            </div>
                            <form
                                className="border-t border-stone-100 p-4"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    send();
                                }}
                            >
                                <label
                                    htmlFor="reader-question"
                                    className="sr-only"
                                >
                                    Ask about the document
                                </label>
                                <textarea
                                    id="reader-question"
                                    rows={3}
                                    className="field resize-none"
                                    placeholder="What does this passage mean?"
                                    value={draft}
                                    maxLength={12000}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" &&
                                            (e.metaKey || e.ctrlKey)
                                        ) {
                                            e.preventDefault();
                                            send();
                                        }
                                    }}
                                />
                                <div className="mt-3 flex items-center justify-between gap-3">
                                    <span className="text-[10px] text-stone-400">
                                        Visible{" "}
                                        {doc.format === "pdf"
                                            ? "pages"
                                            : "sections"}
                                        :{" "}
                                        {visible
                                            .map(
                                                (id) =>
                                                    pages.find(
                                                        (p) => p.id === id,
                                                    )?.number,
                                            )
                                            .join(", ") || "none"}
                                    </span>
                                    {busy ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                controller.current?.abort()
                                            }
                                        >
                                            <Square size={13} /> Stop
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            disabled={!draft.trim()}
                                        >
                                            <ArrowUp size={14} /> Send
                                        </Button>
                                    )}
                                </div>
                            </form>
                        </aside>
                    </div>
                </>
            )}
        </main>
    );
}
