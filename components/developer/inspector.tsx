"use client";
import { useEffect, useState } from "react";
import { RunInspector } from "./run-inspector";
import { LessonQueue } from "@/components/lesson-queue";
import { Button } from "@/components/ui/button";
import type { DocMeta, Document } from "@/lib/workspace/store";
export function Inspector({ initialPath }: { initialPath?: string }) {
    const [documents, setDocuments] = useState<DocMeta[]>([]);
    const [selected, setSelected] = useState("");
    const [doc, setDoc] = useState<Document | null>(null);
    const [content, setContent] = useState("");
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("");
    const [loading, setLoading] = useState(false);
    async function refresh() {
        const response = await fetch("/api/workspace");
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setDocuments(result);
    }
    useEffect(() => {
        refresh().catch((e) => setError(e.message));
        if (initialPath) read(initialPath);
    }, [initialPath]);
    async function read(path: string, revision?: number) {
        setLoading(true);
        setSelected(path);
        setError("");
        try {
            const r = await fetch(
                `/api/workspace?path=${encodeURIComponent(path)}${revision ? `&revision=${revision}` : ""}`,
            );
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setDoc(d);
            setContent(d.content);
        } catch (e) {
            setDoc(null);
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }
    async function save() {
        if (!doc) return;
        setError("");
        const r = await fetch("/api/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                path: doc.meta.path,
                content,
                expectedRevision: doc.meta.revision,
            }),
        });
        const d = await r.json();
        if (!r.ok) {
            setError(d.error);
            return;
        }
        await read(doc.meta.path);
        await refresh();
    }
    const editable =
        doc &&
        ["home/profile.md", "home/curriculum.md"].includes(doc.meta.path);
    return (
        <section id="workspace-inspector" className="developer-panel">
            <RunInspector />
            <details className="mb-5">
                <summary className="cursor-pointer text-sm font-medium">
                    Queue settings
                </summary>
                <LessonQueue settings />
            </details>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="font-semibold">Workspace inspector</h2>
                    <p className="mt-1 text-xs text-stone-500">
                        Documents, exact context, tool activity, and saved
                        evidence. Rubrics reveal answers.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refresh().catch((e) => setError(e.message))}
                >
                    Refresh
                </Button>
            </div>
            {error && (
                <p role="alert" className="notice mt-4">
                    {error}
                </p>
            )}
            <div className="mt-5 grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
                <div>
                    <input
                        className="field mb-3"
                        aria-label="Filter documents"
                        placeholder="Filter documents…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <div className="max-h-[520px] overflow-auto space-y-1">
                        {documents
                            .filter((d) => d.path.includes(filter))
                            .map((d) => (
                                <button
                                    key={d.path}
                                    onClick={() => read(d.path)}
                                    className={`block w-full break-all rounded-lg p-2 text-left text-xs ${selected === d.path ? "bg-teal-100 text-teal-950" : "hover:bg-stone-100"}`}
                                >
                                    <span>{d.path}</span>
                                    <span className="mt-1 block text-[10px] text-stone-500">
                                        v{d.revision} · {d.policy} · {d.actor}
                                    </span>
                                </button>
                            ))}
                    </div>
                </div>
                <div className="min-w-0">
                    {loading ? (
                        <p>Loading document…</p>
                    ) : doc ? (
                        <>
                            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                                <strong className="break-all">
                                    {doc.meta.path}
                                </strong>
                                <span>v{doc.meta.revision}</span>
                                {doc.meta.educational &&
                                    doc.meta.revision > 1 && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                                read(
                                                    doc.meta.path,
                                                    doc.meta.revision - 1,
                                                )
                                            }
                                        >
                                            Previous version
                                        </Button>
                                    )}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => read(doc.meta.path)}
                                >
                                    Latest
                                </Button>
                            </div>
                            <textarea
                                aria-label="Document content"
                                className="field min-h-[380px] font-mono text-xs"
                                value={content}
                                readOnly={!editable}
                                onChange={(e) => setContent(e.target.value)}
                            />
                            {editable && (
                                <Button
                                    className="mt-3"
                                    onClick={save}
                                    disabled={content === doc.content}
                                >
                                    Save document
                                </Button>
                            )}
                        </>
                    ) : (
                        <p className="p-8 text-sm text-stone-500">
                            Select a document to inspect its content and
                            history.
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
