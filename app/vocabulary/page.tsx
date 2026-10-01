"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuizView } from "@/lib/plugins/vocabulary/service";
import { Markdown } from "@/components/markdown";
export default function Vocabulary() {
    const [view, setView] = useState<QuizView | null>(null);
    const [answer, setAnswer] = useState("");
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [overview, setOverview] = useState("");
    const generation = useRef(0);
    async function refresh() {
        const r = await fetch("/api/vocabulary");
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setView(data);
    }
    useEffect(() => {
        refresh().catch((e) => setError(e.message));
    }, []);
    async function act(action: string) {
        const token = ++generation.current;
        setBusy(action);
        setError("");
        try {
            const r = await fetch("/api/vocabulary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    id: view?.active?.id,
                    version: view?.active?.version,
                    answer,
                }),
            });
            const data = await r.json();
            if (token !== generation.current) return;
            if (!r.ok) throw new Error(data.error);
            setView(data);
            if (action !== "answer") setAnswer("");
            if (action === "finish" && data.lastSaved) {
                const response = await fetch(
                    `/api/workspace?path=${encodeURIComponent(`plugins/vocabulary/sessions/${data.lastSaved}/overview.md`)}`,
                );
                const saved = await response.json();
                if (response.ok) setOverview(saved.content);
            }
            if (action === "start") setOverview("");
        } catch (e) {
            if (token === generation.current) {
                setError(e instanceof Error ? e.message : "Request failed");
                await refresh().catch(() => {});
            }
        } finally {
            if (token === generation.current) setBusy("");
        }
    }
    const s = view?.active,
        evidence = s?.evidence,
        last = evidence?.attempts.at(-1),
        checking = busy === "answer" || s?.busy;
    return (
        <div className="mx-auto max-w-3xl py-10 md:py-14">
            <div className="mb-8 flex items-end justify-between gap-4">
                <div>
                    <p className="eyebrow mb-2">Practice</p>
                    <h1 className="serif text-4xl">Vocabulary</h1>
                </div>
                <Link className="text-sm text-teal-700" href="/">
                    {view?.ready ?? 0} lessons ready · Home ↗
                </Link>
            </div>
            {error && (
                <p role="alert" className="notice mb-5">
                    {error}
                </p>
            )}
            {!view ? (
                <p>Loading your lessons…</p>
            ) : s ? (
                <>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="font-medium">{s.title}</h2>
                            <p className="mt-1 text-sm text-stone-500">
                                {s.objective}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={Boolean(busy && !checking)}
                            onClick={() => act("restart")}
                        >
                            <RotateCcw size={14} /> Restart
                        </Button>
                    </div>
                    <section className="panel overflow-hidden">
                        <div className="flex items-center justify-between p-5 text-xs text-stone-500">
                            <span className="font-semibold uppercase tracking-widest">
                                Question {s.index + 1} of {s.total}
                            </span>
                            <span>
                                {s.replays
                                    ? `Replay ${s.replays}`
                                    : "Prepared practice"}
                            </span>
                        </div>
                        <div className="h-1 bg-stone-100">
                            <div
                                className="h-full bg-teal-700 transition-all"
                                style={{
                                    width: `${((s.index + (evidence?.resolved ? 1 : 0)) / s.total) * 100}%`,
                                }}
                            />
                        </div>
                        <div className="p-6 md:p-9">
                            <p className="eyebrow mb-4">{s.question.label}</p>
                            <h3 className="serif mb-6 text-2xl leading-relaxed md:text-3xl">
                                {s.question.prompt}
                            </h3>
                            {s.constraints && (
                                <p className="mb-5 text-xs leading-relaxed text-stone-500">
                                    {s.constraints}
                                </p>
                            )}
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (
                                        !busy &&
                                        !evidence?.resolved &&
                                        answer.trim()
                                    )
                                        act("answer");
                                }}
                            >
                                <label
                                    htmlFor="answer"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Your understanding
                                </label>
                                <textarea
                                    id="answer"
                                    className="field min-h-28"
                                    placeholder="A word, an explanation, or an example…"
                                    value={answer}
                                    onChange={(e) => setAnswer(e.target.value)}
                                    disabled={Boolean(
                                        checking || evidence?.resolved,
                                    )}
                                    maxLength={6000}
                                />
                                {last && (
                                    <div
                                        className={`mt-5 rounded-xl border p-4 ${last.assessment.outcome === "needs_adjustment" ? "border-amber-200 bg-amber-50" : "border-teal-200 bg-teal-50"}`}
                                        role="status"
                                    >
                                        <p className="mb-2 text-sm font-semibold">
                                            {last.assessment.outcome === "pass"
                                                ? "Understood"
                                                : last.assessment.outcome ===
                                                    "pass_with_clarification"
                                                  ? "Understood, with a clarification"
                                                  : "A little adjustment"}
                                        </p>
                                        <Markdown
                                            text={last.assessment.feedback}
                                        />
                                        {last.assessment.constraintFeedback && (
                                            <p className="text-xs mt-2">
                                                {
                                                    last.assessment
                                                        .constraintFeedback
                                                }
                                            </p>
                                        )}
                                    </div>
                                )}
                                {evidence?.skipped && (
                                    <p className="mt-3 text-sm text-stone-500">
                                        Skipped.
                                    </p>
                                )}
                                <div className="mt-6 flex flex-wrap items-center gap-3">
                                    {evidence?.resolved ? (
                                        <Button
                                            type="button"
                                            disabled={Boolean(busy)}
                                            onClick={() =>
                                                act(
                                                    s.index === s.total - 1
                                                        ? "finish"
                                                        : "next",
                                                )
                                            }
                                        >
                                            {s.index === s.total - 1
                                                ? "Finish session"
                                                : "Next question"}
                                            <ArrowRight size={16} />
                                        </Button>
                                    ) : (
                                        <>
                                            <Button
                                                disabled={Boolean(
                                                    busy ||
                                                    checking ||
                                                    !answer.trim(),
                                                )}
                                            >
                                                {checking ? (
                                                    <>
                                                        <LoaderCircle
                                                            className="animate-spin"
                                                            size={16}
                                                        />{" "}
                                                        Checking…
                                                    </>
                                                ) : (
                                                    <>
                                                        Check answer{" "}
                                                        <ArrowRight size={16} />
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                disabled={Boolean(
                                                    busy || checking,
                                                )}
                                                onClick={() => act("skip")}
                                            >
                                                Skip
                                            </Button>
                                        </>
                                    )}
                                    <span className="ml-auto text-xs text-stone-400">
                                        {evidence?.attempts.length ?? 0} of 3
                                        attempts
                                    </span>
                                </div>
                            </form>
                        </div>
                    </section>
                    <div className="mt-5 flex justify-between gap-4 text-xs text-stone-500">
                        <p>
                            Restart discards these answers and replays this
                            lesson.
                        </p>
                        <button
                            className="shrink-0 underline"
                            disabled={Boolean(busy && !checking)}
                            onClick={() => act("finish")}
                        >
                            End early & save
                        </button>
                    </div>
                </>
            ) : (
                <section className="panel p-8 md:p-10">
                    {overview ? (
                        <>
                            <Check className="mb-4 text-teal-700" />
                            <Markdown text={overview} />
                        </>
                    ) : (
                        <>
                            <h2 className="serif text-2xl mb-3">
                                {view.ready
                                    ? "Your next lesson is ready."
                                    : "A little direction first."}
                            </h2>
                            <p className="text-sm leading-relaxed text-stone-500 mb-6">
                                {view.ready
                                    ? "Ten questions prepared by Home around your learning goals. Answer in your own words."
                                    : "Tell Home what you’d like to do with Spanish. It will use your profile and curriculum to prepare your lesson queue."}
                            </p>
                        </>
                    )}
                    {view.ready ? (
                        <Button
                            className="mt-5"
                            disabled={Boolean(busy)}
                            onClick={() => act("start")}
                        >
                            Start lesson
                            <ArrowRight size={16} />
                        </Button>
                    ) : (
                        <Link
                            className="mt-5 inline-block text-sm font-medium text-teal-700 underline"
                            href="/"
                        >
                            Go to Home
                        </Link>
                    )}
                </section>
            )}
        </div>
    );
}
