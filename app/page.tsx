"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    ArrowRight,
    Check,
    Code2,
    Layers3,
    Loader2,
    RotateCcw,
    Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DEFAULT_LEARNER,
    SESSION_LENGTH,
    type Command,
    type Snapshot,
    type Summary,
} from "@/lib/types";

const textareaStyle =
    "w-full resize-y rounded-xl border border-stone-300 bg-white p-4 text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 disabled:opacity-60";
function SummaryView({ summary }: { summary: Summary }) {
    return (
        <div className="space-y-5 text-sm leading-6">
            <p>{summary.overview}</p>
            {(
                [
                    ["Covered", summary.covered],
                    ["Evidence of understanding", summary.demonstrated],
                    ["Worth revisiting", summary.needsPractice],
                ] as const
            ).map(
                ([label, items]) =>
                    items.length > 0 && (
                        <div key={label}>
                            <h3 className="mb-1 font-semibold">{label}</h3>
                            <ul className="list-disc space-y-1 pl-5 text-stone-600">
                                {items.map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    ),
            )}
            <p className="rounded-xl bg-teal-50 p-4">
                <strong>Next time:</strong> {summary.nextFocus}
            </p>
        </div>
    );
}
export default function Home() {
    const [data, setData] = useState<Snapshot | null>(null);
    const [seed, setSeed] = useState(DEFAULT_LEARNER);
    const [answer, setAnswer] = useState("");
    const [developer, setDeveloper] = useState(false);
    const [pending, setPending] = useState<Command["action"] | null>(null);
    const [error, setError] = useState("");
    const epoch = useRef(0);
    const answerInput = useRef<HTMLTextAreaElement>(null);
    const refresh = useCallback(async (expectedEpoch = epoch.current) => {
        const response = await fetch("/api/tutor", { cache: "no-store" });
        const body = await response.json();
        if (epoch.current !== expectedEpoch) return;
        if (!response.ok) throw new Error(body.error);
        setData(body);
    }, []);
    useEffect(() => {
        refresh().catch((error) => setError(error.message));
    }, [refresh]);
    useEffect(() => {
        if (data) setSeed(data.checkpoint.learnerDescription);
    }, [data?.checkpoint.learnerDescription]); // Sync only when the saved description changes.
    useEffect(() => {
        if (!pending && !data?.session?.busy) return;
        const timer = setInterval(() => {
            refresh().catch(() => {});
        }, 1200);
        return () => clearInterval(timer);
    }, [pending, data?.session?.busy, refresh]);
    const session = data?.session;
    const active = session?.status === "active";
    const current = session?.evidence.at(-1);
    const last = current?.attempts.at(-1);
    const working = Boolean(pending || session?.busy);
    const dirty = Boolean(
        data && seed.trim() !== data.checkpoint.learnerDescription,
    );
    useEffect(() => {
        setAnswer("");
    }, [current?.question.id, session?.id]);
    useEffect(() => {
        if (active && current && !current.resolved && !working)
            answerInput.current?.focus();
    }, [current?.question.id, working, active, current?.resolved]);
    async function act(
        action: Command["action"],
        extra: Partial<Command> = {},
    ) {
        const requestEpoch = ++epoch.current;
        setPending(action);
        setError("");
        try {
            const response = await fetch("/api/tutor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    sessionId: session?.id,
                    version: session?.version,
                    ...extra,
                }),
            });
            const body = await response.json();
            if (requestEpoch !== epoch.current) return;
            if (!response.ok)
                throw new Error(
                    body.error || "Something went wrong. Please retry.",
                );
            setData(body);
            if (action === "restart" || action === "start") {
                setAnswer("");
                setSeed(body.checkpoint.learnerDescription);
            }
        } catch (error) {
            if (requestEpoch !== epoch.current) return;
            setError(
                error instanceof Error
                    ? error.message
                    : "Unable to reach the tutor.",
            );
            await refresh(requestEpoch).catch(() => {});
        } finally {
            if (requestEpoch === epoch.current) setPending(null);
        }
    }
    const outcomeLabels = {
        pass: "You’ve got it",
        pass_with_clarification: "Yes, with a small clarification",
        needs_adjustment: "Let’s adjust that",
    };
    const finished = (session?.evidence.length ?? 0) >= SESSION_LENGTH;
    return (
        <main className="mx-auto max-w-7xl px-5 pb-16 sm:px-10">
            <header className="flex items-center justify-between gap-4 border-b border-stone-200 py-6">
                <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-teal-900 p-2.5 text-white">
                        <Layers3 className="size-5" />
                    </span>
                    <span className="serif text-3xl tracking-tight">
                        wordfield<span className="text-teal-700">.</span>
                    </span>
                    <span className="ml-3 hidden text-[10px] tracking-[.2em] text-stone-500 sm:block">
                        VOCABULARY LAB
                    </span>
                </div>
                <Button
                    variant={developer ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setDeveloper(!developer)}
                    aria-pressed={developer}
                >
                    <Code2 /> <span>Developer view</span>
                </Button>
            </header>
            <section className="pb-9 pt-12 sm:pt-16">
                <p className="mb-4 text-xs font-semibold uppercase tracking-[.22em] text-teal-800">
                    Small lessons. Room to grow.
                </p>
                <h1 className="serif max-w-3xl text-4xl leading-[1.12] tracking-tight sm:text-6xl">
                    A little practice.
                    <br />
                    <span className="text-teal-800">
                        A clearer understanding.
                    </span>
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-stone-600">
                    Explain it in your own words. Your tutor follows what you
                    understand, adds context, and helps you take the next step.
                </p>
            </section>
            {error && (
                <div
                    role="alert"
                    className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                >
                    {error}
                    {!data && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                refresh()
                                    .then(() => setError(""))
                                    .catch((e) => setError(e.message))
                            }
                        >
                            Retry
                        </Button>
                    )}
                </div>
            )}
            {data && !data.configured && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6">
                    To start live lessons, add <code>OPENAI_API_KEY</code> to{" "}
                    <code>.env.local</code> and restart the development server.
                    Your key stays on the server.
                </div>
            )}
            <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_350px]">
                <section
                    className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
                    aria-label="Vocabulary session"
                >
                    <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-6 py-4 sm:px-8">
                        <span className="text-xs font-semibold uppercase tracking-[.15em] text-stone-500">
                            {active
                                ? `Question ${Math.max(1, session.evidence.length)} of ${SESSION_LENGTH}`
                                : session?.status === "saved"
                                  ? "Session complete"
                                  : "Your next session"}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-teal-800">
                            <Sparkles className="size-3.5" /> Adaptive practice
                        </span>
                    </div>
                    {active && (
                        <div className="h-1 bg-stone-100">
                            <div
                                className="h-full bg-teal-700 transition-all"
                                style={{
                                    width: `${(session.evidence.filter((e) => e.resolved).length / SESSION_LENGTH) * 100}%`,
                                }}
                            />
                        </div>
                    )}
                    <div className="p-6 sm:p-8">
                        {!data ? (
                            <p
                                role="status"
                                className="py-14 text-center text-stone-500"
                            >
                                Loading your checkpoint…
                            </p>
                        ) : !active && session?.status !== "saved" ? (
                            <div className="py-7">
                                <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-800">
                                    <Sparkles />
                                </div>
                                <h2 className="serif text-3xl">
                                    Start where you are.
                                </h2>
                                <p className="mb-7 mt-4 max-w-lg leading-7 text-stone-600">
                                    Ten questions, one at a time. Give a
                                    translation, a definition, or an example.
                                    You can use English or Spanish unless you
                                    set a preference in your learner
                                    description.
                                </p>
                                <Button
                                    disabled={
                                        working ||
                                        !data.configured ||
                                        !seed.trim()
                                    }
                                    onClick={() =>
                                        act(
                                            "start",
                                            dirty
                                                ? { learnerDescription: seed }
                                                : {},
                                        )
                                    }
                                >
                                    Start a session <ArrowRight />
                                </Button>
                                <p className="mt-4 text-xs leading-5 text-stone-500">
                                    Only saved session logs carry forward. You
                                    can end early or restart at any point.
                                </p>
                            </div>
                        ) : session?.status === "saved" ? (
                            <div className="arrive">
                                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-900">
                                    <Check className="size-3.5" />{" "}
                                    {session.summary
                                        ? "Checkpoint updated"
                                        : "No learning evidence to save"}
                                </div>
                                <h2 className="serif mb-6 text-3xl">
                                    A little more to build on.
                                </h2>
                                {session.summary ? (
                                    <SummaryView summary={session.summary} />
                                ) : (
                                    <p className="text-sm text-stone-600">
                                        This session ended before an answer or
                                        skip. Your checkpoint is unchanged.
                                    </p>
                                )}
                                <Button
                                    className="mt-7"
                                    disabled={working || !seed.trim()}
                                    onClick={() =>
                                        act(
                                            "start",
                                            dirty
                                                ? { learnerDescription: seed }
                                                : {},
                                        )
                                    }
                                >
                                    Start next session <ArrowRight />
                                </Button>
                            </div>
                        ) : current ? (
                            <div className="arrive" key={current.question.id}>
                                <p className="mb-4 text-xs uppercase tracking-[.15em] text-teal-800">
                                    {current.question.focus}
                                </p>
                                <h2 className="serif mb-7 whitespace-pre-wrap text-3xl leading-snug sm:text-4xl">
                                    {current.question.prompt
                                        .split(/(\*\*[^*]+\*\*)/g)
                                        .map((part, index) =>
                                            part.startsWith("**") &&
                                            part.endsWith("**") ? (
                                                <strong key={index}>
                                                    {part.slice(2, -2)}
                                                </strong>
                                            ) : (
                                                part
                                            ),
                                        )}
                                </h2>
                                <form
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        if (
                                            !working &&
                                            !current.resolved &&
                                            answer.trim()
                                        )
                                            act("answer", { answer });
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
                                        ref={answerInput}
                                        className={textareaStyle}
                                        rows={4}
                                        maxLength={6000}
                                        value={answer}
                                        onChange={(event) =>
                                            setAnswer(event.target.value)
                                        }
                                        disabled={working || current.resolved}
                                        placeholder="A word, an explanation, or an example…"
                                    />
                                    {!current.resolved && (
                                        <div className="mt-4 flex flex-wrap items-center gap-3">
                                            <Button
                                                type="submit"
                                                disabled={
                                                    working || !answer.trim()
                                                }
                                            >
                                                Check answer <ArrowRight />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                disabled={working}
                                                onClick={() => act("skip")}
                                            >
                                                Skip
                                            </Button>
                                            <span className="ml-auto text-xs text-stone-400">
                                                Attempt{" "}
                                                {Math.min(
                                                    current.attempts.length + 1,
                                                    3,
                                                )}{" "}
                                                of 3
                                            </span>
                                        </div>
                                    )}
                                </form>
                                <div aria-live="polite">
                                    {(last || current.skipped) && (
                                        <div
                                            className={`mt-6 rounded-xl border p-5 ${current.skipped || last?.assessment.outcome === "needs_adjustment" ? "border-amber-100 bg-amber-50/70" : "border-teal-100 bg-teal-50/70"}`}
                                        >
                                            <h3 className="mb-2 text-sm font-semibold">
                                                {current.skipped
                                                    ? "Set aside for now"
                                                    : outcomeLabels[
                                                          last!.assessment
                                                              .outcome
                                                      ]}
                                            </h3>
                                            {last && (
                                                <>
                                                    <p className="whitespace-pre-wrap text-sm leading-6">
                                                        {
                                                            last.assessment
                                                                .feedback
                                                        }
                                                    </p>
                                                    {last.assessment
                                                        .languageNotes && (
                                                        <p className="mt-2 text-sm leading-6 text-stone-600">
                                                            {
                                                                last.assessment
                                                                    .languageNotes
                                                            }
                                                        </p>
                                                    )}
                                                    {!last.assessment
                                                        .constraintMet && (
                                                        <p className="mt-2 text-sm leading-6">
                                                            {
                                                                last.assessment
                                                                    .constraintFeedback
                                                            }
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                            {(current.skipped ||
                                                (current.resolved &&
                                                    last?.assessment.outcome ===
                                                        "needs_adjustment")) && (
                                                <p className="mt-3 text-sm leading-6">
                                                    <strong>
                                                        One possible answer:
                                                    </strong>{" "}
                                                    {
                                                        current.question.rubric
                                                            .exampleAnswer
                                                    }
                                                </p>
                                            )}
                                            {!current.resolved && (
                                                <p className="mt-3 text-xs text-stone-500">
                                                    Edit your answer above and
                                                    try again.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {current.resolved && (
                                    <Button
                                        className="mt-6"
                                        disabled={working}
                                        onClick={() =>
                                            act(finished ? "end" : "next")
                                        }
                                    >
                                        {finished
                                            ? "Finish & save session"
                                            : "Next question"}
                                        <ArrowRight />
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="py-14 text-center">
                                <h2 className="serif mb-4 text-3xl">
                                    A fresh starting point.
                                </h2>
                                <p className="text-sm text-stone-500">
                                    {working
                                        ? "Preparing your first question…"
                                        : "Your checkpoint is loaded. Try generating your first question again."}
                                </p>
                                {!working && (
                                    <Button
                                        className="mt-5"
                                        onClick={() => act("next")}
                                    >
                                        Try again
                                    </Button>
                                )}
                            </div>
                        )}
                        {working && (
                            <p
                                role="status"
                                className="mt-6 flex items-center gap-2 text-sm text-teal-800"
                            >
                                <Loader2 className="size-4 animate-spin" />
                                {pending === "end"
                                    ? "Writing your session log…"
                                    : pending === "answer"
                                      ? "Considering your answer…"
                                      : "Your tutor is working…"}
                            </p>
                        )}
                    </div>
                    {active && (
                        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/70 px-6 py-4 sm:px-8">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={!session || pending === "restart"}
                                onClick={() => act("restart")}
                            >
                                <RotateCcw /> Restart
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={working}
                                onClick={() => act("end")}
                            >
                                End & save session
                            </Button>
                            <p className="w-full text-xs leading-5 text-stone-500">
                                Restart discards this session and returns to
                                your latest saved checkpoint.
                            </p>
                        </footer>
                    )}
                </section>
                <aside className="space-y-5">
                    <section className="rounded-2xl border border-stone-200 bg-[#f0f2ec] p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="serif text-2xl">
                                Your starting point
                            </h2>
                            <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] uppercase tracking-wider text-stone-500">
                                Seed prompt
                            </span>
                        </div>
                        <label
                            htmlFor="seed"
                            className="mb-2 block text-xs leading-5 text-stone-600"
                        >
                            Describe your level, interests, and any preferences,
                            such as “I can only respond in Spanish.”
                        </label>
                        <textarea
                            id="seed"
                            className={`${textareaStyle} bg-white/80`}
                            rows={9}
                            maxLength={6000}
                            value={seed}
                            onChange={(event) => setSeed(event.target.value)}
                            disabled={!data || working}
                        />
                        <Button
                            className="mt-3 w-full"
                            variant="outline"
                            disabled={
                                !data || !dirty || !seed.trim() || working
                            }
                            onClick={() =>
                                act(active ? "restart" : "save_seed", {
                                    learnerDescription: seed,
                                })
                            }
                        >
                            {active
                                ? "Apply & restart session"
                                : "Save learner description"}
                        </Button>
                        <p className="mt-3 text-xs leading-5 text-stone-500">
                            {dirty
                                ? "Unsaved changes. Applying these during a lesson discards that lesson."
                                : "Saved description. Each new session also receives your prior session logs."}
                        </p>
                    </section>
                    <section className="rounded-2xl border border-stone-200 p-6">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="serif text-xl">Saved checkpoint</h2>
                            <span className="text-xs text-stone-500">
                                {data?.checkpoint.logs.length ?? 0} logs
                            </span>
                        </div>
                        <p className="text-xs leading-5 text-stone-500">
                            Evidence from completed or explicitly ended
                            sessions. Current answers are not saved here.
                        </p>
                        <div className="mt-4 space-y-3">
                            {data?.checkpoint.logs.length ? (
                                [...data.checkpoint.logs]
                                    .reverse()
                                    .map((log) => (
                                        <details
                                            key={log.id}
                                            className="rounded-xl border border-stone-200 bg-white p-4"
                                        >
                                            <summary className="cursor-pointer text-sm font-medium">
                                                {new Date(
                                                    log.endedAt,
                                                ).toLocaleDateString(
                                                    undefined,
                                                    {
                                                        month: "short",
                                                        day: "numeric",
                                                    },
                                                )}{" "}
                                                · {log.questionsAnswered}{" "}
                                                answered
                                            </summary>
                                            <div className="mt-4">
                                                <SummaryView
                                                    summary={log.summary}
                                                />
                                            </div>
                                        </details>
                                    ))
                            ) : (
                                <p className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500">
                                    Your first session will give us something to
                                    build on.
                                </p>
                            )}
                        </div>
                    </section>
                </aside>
            </div>
            {developer && (
                <section
                    className="mt-8 rounded-2xl border border-stone-300 bg-[#edf0eb] p-6"
                    aria-label="Developer view"
                >
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="flex items-center gap-2 text-sm font-semibold">
                            <Code2 className="size-4" /> Developer view
                        </h2>
                        <p className="text-xs text-stone-500">
                            {data?.model} · checkpoint{" "}
                            {data?.checkpoint.revision ?? 0}
                            {session?.lastCallMs != null
                                ? ` · last request ${(session.lastCallMs / 1000).toFixed(1)}s`
                                : ""}
                        </p>
                    </div>
                    <p className="mb-5 text-xs leading-5 text-stone-600">
                        Inspect the fixed question rubric, structured
                        assessments, and actual session input. Opening this view
                        reveals expected answers; use it for development, not an
                        unaided learning check.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                        {[
                            [
                                "Actual session seed",
                                session?.seed ??
                                    "Start a session to inspect its exact seed.",
                            ],
                            [
                                "Current question & rubric",
                                current?.question ?? null,
                            ],
                            [
                                "Assessment & attempt history",
                                current?.attempts ?? [],
                            ],
                            ["Session evidence", session?.evidence ?? []],
                            ["Saved checkpoint", data?.checkpoint ?? null],
                        ].map(([label, value]) => (
                            <details
                                key={label as string}
                                open={
                                    label === "Actual session seed" ||
                                    label === "Current question & rubric"
                                }
                                className="min-w-0 rounded-xl border border-stone-200 bg-white p-4"
                            >
                                <summary className="cursor-pointer text-xs font-semibold">
                                    {label as string}
                                </summary>
                                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-stone-600">
                                    {typeof value === "string"
                                        ? value
                                        : JSON.stringify(value, null, 2)}
                                </pre>
                            </details>
                        ))}
                    </div>
                </section>
            )}
            <footer className="mt-10 text-center text-xs leading-5 text-stone-400">
                An experiment in learning through understanding. AI feedback can
                be imperfect.
            </footer>
        </main>
    );
}
