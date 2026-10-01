"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Square, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Markdown } from "./markdown";
import type { ChatMessage } from "@/lib/home/service";
type Live = {
    id: string;
    status: string;
    text: string;
    trigger: string;
    error?: string;
    tool?: string;
};
export function HomeChat({ onChanged }: { onChanged: () => void }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [live, setLive] = useState<Live | null>(null);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const [configured, setConfigured] = useState(true);
    const [sending, setSending] = useState(false);
    const end = useRef<HTMLDivElement>(null);
    const changed = useRef(onChanged);
    changed.current = onChanged;
    const refresh = useCallback(async () => {
        const r = await fetch("/api/home");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setMessages(d.messages);
        setLive(d.run);
        setConfigured(d.configured);
    }, []);
    useEffect(() => {
        refresh().catch((e) => setError(e.message));
        const source = new EventSource("/api/home?events=1");
        source.onmessage = (event) => {
            const run = JSON.parse(event.data);
            if (run) {
                setLive(run);
                if (run.status !== "running") {
                    refresh().catch((e) => setError(e.message));
                    changed.current();
                }
            }
        };
        return () => source.close();
    }, [refresh]);
    useEffect(() => {
        end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [live?.text, messages.length]);
    async function send(message = draft) {
        if (!message.trim()) return;
        setSending(true);
        setError("");
        try {
            const r = await fetch("/api/home", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "message", message }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setDraft("");
            await refresh();
        } catch (e) {
            setError(String(e));
        } finally {
            setSending(false);
        }
    }
    const busy = sending || live?.status === "running";
    return (
        <section className="panel flex min-h-[580px] flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-stone-100 px-6 py-4">
                <Sparkles className="size-4 text-teal-700" />
                <h2 className="font-medium">Your learning guide</h2>
                <span className="ml-auto text-xs text-stone-400">Home</span>
            </div>
            <div className="max-h-[620px] flex-1 overflow-auto p-6 space-y-6">
                {!messages.length && (
                    <div className="py-9">
                        <h2 className="serif text-3xl">
                            A goal gives practice a purpose.
                        </h2>
                        <p className="mt-4 text-sm leading-7 text-stone-600">
                            Tell me what you want to do in Spanish—travel, talk
                            with friends, read novels, or something else. We’ll
                            shape your curriculum around that.
                        </p>
                        <button
                            className="mt-5 rounded-xl border border-stone-200 px-4 py-3 text-left text-sm text-teal-800 hover:bg-teal-50"
                            onClick={() =>
                                setDraft(
                                    "Help me set a useful learning goal and plan my first lessons.",
                                )
                            }
                        >
                            Help me find a starting point →
                        </button>
                    </div>
                )}
                {messages.map((m) => (
                    <article
                        key={m.id}
                        className={
                            m.role === "user"
                                ? "ml-8 rounded-2xl bg-[#eef2ea] p-4"
                                : m.role === "system"
                                  ? "rounded-lg border border-dashed border-stone-200 p-3 text-xs text-stone-500"
                                  : "pr-4"
                        }
                    >
                        <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-400">
                            {m.role === "user"
                                ? "You"
                                : m.role === "system"
                                  ? "Automatic queue review"
                                  : "Wordfield"}
                        </p>
                        <Markdown text={m.text} />
                    </article>
                ))}
                {live?.status === "running" && (
                    <article>
                        <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-400">
                            {live.trigger === "queue_refill"
                                ? "Wordfield · replenishing lessons"
                                : "Wordfield"}
                        </p>
                        <Markdown text={live.text} />
                        <p
                            role="status"
                            className="mt-3 flex items-center gap-2 text-xs text-teal-700"
                        >
                            <Loader2 className="size-3 animate-spin" />
                            {live.tool
                                ? `Working with ${live.tool.replaceAll("_", " ")}…`
                                : "Thinking about your next step…"}
                        </p>
                    </article>
                )}
                {live?.error && (
                    <p role="alert" className="notice">
                        {live.error}
                    </p>
                )}
                <div ref={end} />
            </div>
            <div className="border-t border-stone-100 p-5">
                {!configured && (
                    <p className="notice mb-3">
                        Add OPENAI_API_KEY to .env.local to enable the guide.
                    </p>
                )}
                {error && (
                    <p role="alert" className="notice mb-3">
                        {error}
                    </p>
                )}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        send();
                    }}
                >
                    <label className="sr-only" htmlFor="home-message">
                        Message your learning guide
                    </label>
                    <textarea
                        id="home-message"
                        className="field resize-none"
                        rows={3}
                        maxLength={12000}
                        placeholder="What would you like to work toward?"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                if (!busy) send();
                            }
                        }}
                    />
                    <div className="mt-3 flex items-center justify-between">
                        <p className="text-xs text-stone-400">
                            Home can update your learning documents.
                        </p>
                        {busy ? (
                            <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                onClick={() =>
                                    fetch("/api/home", {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                            action: "cancel",
                                        }),
                                    })
                                }
                            >
                                <Square /> Stop
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                size="sm"
                                disabled={!draft.trim() || !configured}
                            >
                                <ArrowUp /> Send
                            </Button>
                        )}
                    </div>
                </form>
            </div>
        </section>
    );
}
