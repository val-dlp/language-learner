"use client";
import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  Code2,
  Compass,
  Layers3,
  LoaderCircle,
  Search,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newQuiz, quizReducer } from "@/lib/quiz";
import type { SearchResult } from "@/lib/types";
const examples = [
  {
    topic: "kitchen utensils",
    note: "A distinct cluster",
    label: "01",
    icon: "↗",
  },
  {
    topic: "musical instruments",
    note: "A distinct cluster",
    label: "02",
    icon: "♪",
  },
  {
    topic: "geometric shapes",
    note: "A distinct cluster",
    label: "03",
    icon: "◇",
  },
  {
    topic: "outdoor adventure",
    note: "An overlapping cluster",
    label: "04",
    icon: "↟",
  },
  {
    topic: "cold weather",
    note: "An overlapping cluster",
    label: "05",
    icon: "❋",
  },
  {
    topic: "sports equipment",
    note: "An overlapping cluster",
    label: "06",
    icon: "↔",
  },
];
export default function Page() {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [developer, setDeveloper] = useState(false);
  const [answer, setAnswer] = useState("");
  const [state, dispatch] = useReducer(quizReducer, [], newQuiz);
  const answerRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const current = state.items[state.index];
  const complete = !!result && !current;
  useEffect(() => {
    if (result && !developer) answerRef.current?.focus();
  }, [state.index, result, developer]);
  async function start(value: string) {
    if (busy) return;
    const id = ++requestId.current;
    setTopic(value);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: value }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to search. Please retry.");
      if (id !== requestId.current) return;
      setResult(data);
      dispatch({ type: "reset", items: data.items });
      setAnswer("");
    } catch (error) {
      if (id === requestId.current)
        setError(
          error instanceof Error
            ? error.message
            : "Unable to search. Please retry.",
        );
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  function reset() {
    ++requestId.current;
    setResult(null);
    setAnswer("");
    setError("");
    setBusy(false);
    dispatch({ type: "reset", items: [] });
  }
  function submitAnswer(event: FormEvent) {
    event.preventDefault();
    dispatch({ type: "answer", value: answer });
    setAnswer("");
    answerRef.current?.focus();
  }
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200/80 bg-[#f8f7f3]">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-10">
          <button
            onClick={reset}
            aria-label="Wordfield home"
            className="flex items-center gap-3"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-teal-900 text-white">
              <Layers3 size={20} />
            </span>
            <span className="text-xl font-semibold tracking-tight">
              wordfield<span className="text-teal-700">.</span>
            </span>
            <span className="ml-2 hidden rounded border border-stone-300 px-2 py-1 text-[9px] font-semibold tracking-[.18em] text-stone-500 sm:block">
              VOCABULARY LAB
            </span>
          </button>
          <Button
            variant={developer ? "default" : "outline"}
            size="sm"
            onClick={() => setDeveloper(!developer)}
            aria-pressed={developer}
          >
            <Code2 />
            <span className="hidden sm:inline">Developer view</span>
            <span className="sm:hidden">Inspect</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-10 sm:pt-14">
        <div className="mb-8 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[.15em] text-stone-500">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-teal-700" /> Experiment
            001 <span className="mx-2 text-stone-300">/</span> Semantic
            vocabulary
          </span>
          <span className="hidden sm:block">English → Spanish</span>
        </div>
        {!result && (
          <div className="arrive grid gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:gap-16">
            <section className="pt-2">
              <h1 className="serif max-w-xl text-5xl leading-[1.12] tracking-[-.045em] sm:text-6xl lg:text-[68px]">
                A little curiosity.
                <br />
                Ten new <span className="italic text-teal-800">words.</span>
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-stone-500">
                Pick a topic. Explore the words around it.
                <br className="hidden sm:block" /> Practice Spanish, one
                translation at a time.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void start(topic);
                }}
                className="mt-10 max-w-xl"
              >
                <label
                  htmlFor="topic"
                  className="mb-3 block text-xs font-semibold"
                >
                  What would you like to explore?
                </label>
                <div className="flex gap-2 rounded-xl border border-stone-300 bg-white p-2 shadow-[0_4px_20px_#242e2b05]">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-3.5 size-4 text-stone-400" />
                    <Input
                      id="topic"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. kitchen utensils"
                      maxLength={80}
                      disabled={busy}
                      className="border-0 pl-10 shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={busy || !topic.trim()}
                    className="h-12 px-4 sm:px-5"
                  >
                    {busy ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <>
                        <span className="hidden sm:inline">Explore</span>
                        <ArrowRight />
                      </>
                    )}
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-5 text-stone-400">
                  One or two English words. No account, no saved results.
                </p>
              </form>
              {busy && (
                <p role="status" className="mt-5 text-sm text-teal-800">
                  Finding nearby words… The first search loads the local model.
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  {error}
                </p>
              )}
              <div className="mt-10 flex gap-7 border-t border-stone-200 pt-6">
                <div>
                  <p className="serif text-2xl">150</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-stone-400">
                    Curated words
                  </p>
                </div>
                <div className="w-px bg-stone-200" />
                <div>
                  <p className="serif text-2xl">10</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-stone-400">
                    Per session
                  </p>
                </div>
                <div className="w-px bg-stone-200" />
                <div>
                  <p className="serif text-2xl">Your pace</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-stone-400">
                    No timer
                  </p>
                </div>
              </div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-[#dce3db] bg-[#eef1e9]">
              <div
                className="grid-paper relative flex h-44 items-center justify-center overflow-hidden border-b border-[#dce3db] sm:h-52"
                aria-hidden="true"
              >
                <div className="absolute size-44 rounded-full border border-teal-900/10" />
                <div className="absolute size-64 rounded-full border border-teal-900/10" />
                <div className="absolute h-px w-full rotate-[-18deg] bg-teal-900/10" />
                <span className="absolute left-[12%] top-8 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs text-stone-500 shadow-sm">
                  cuchara
                </span>
                <span className="absolute bottom-7 right-[9%] rounded-full border border-stone-200 bg-white px-4 py-2 text-xs text-stone-500 shadow-sm">
                  tenedor
                </span>
                <span className="z-10 flex items-center gap-2 rounded-full bg-teal-900 px-5 py-3 text-sm text-white shadow-lg shadow-teal-900/10">
                  <Sparkles size={15} /> kitchen utensils
                </span>
                <span className="absolute right-[14%] top-9 size-2 rounded-full bg-teal-700/40" />
                <span className="absolute bottom-9 left-[22%] size-2 rounded-full bg-teal-700/40" />
              </div>
              <div className="p-6 sm:p-7">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[.13em]">
                    Follow a starting point
                  </h2>
                  <Compass size={16} className="text-stone-400" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {examples.map((example) => (
                    <button
                      key={example.topic}
                      disabled={busy}
                      onClick={() => void start(example.topic)}
                      className="group rounded-xl border border-stone-200/80 bg-white/65 p-4 text-left transition hover:border-teal-700/40 hover:bg-white disabled:opacity-50"
                    >
                      <div className="mb-4 flex items-center justify-between text-stone-400">
                        <span className="text-[10px] tracking-widest">
                          {example.label}
                        </span>
                        <ArrowUpRight
                          size={15}
                          className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-teal-700"
                        />
                      </div>
                      <p className="text-[13px] font-medium capitalize">
                        {example.topic}
                      </p>
                      <p className="mt-1 text-[10px] text-stone-500">
                        {example.note}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
        {result && (
          <div className="arrive">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <button
                  onClick={reset}
                  className="mb-3 flex items-center gap-1 text-xs text-stone-500 hover:text-teal-800"
                >
                  <ChevronLeft size={14} /> New topic
                </button>
                <h1 className="serif text-4xl tracking-tight capitalize sm:text-5xl">
                  {result.topic}
                  <span className="text-teal-700">.</span>
                </h1>
              </div>
              <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
                English → Spanish <span className="mx-2 text-stone-300">/</span>{" "}
                10 words
              </div>
            </div>
            {developer ? (
              <DeveloperView result={result} />
            ) : (
              <section className="mx-auto max-w-2xl py-4 sm:py-8">
                <div className="mb-3 flex justify-between text-xs text-stone-500">
                  <span>
                    {complete ? "All done" : `Word ${state.index + 1} of 10`}
                  </span>
                  <span>
                    {complete ? "Session complete" : "Translate into English"}
                  </span>
                </div>
                <div
                  className="mb-6 h-1 overflow-hidden rounded-full bg-stone-200"
                  role="progressbar"
                  aria-label="Quiz progress"
                  aria-valuemin={0}
                  aria-valuemax={10}
                  aria-valuenow={state.index}
                >
                  <div
                    className="h-full bg-teal-700 transition-all"
                    style={{ width: `${state.index * 10}%` }}
                  />
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-[0_8px_40px_#242e2b04] sm:p-12">
                  {complete ? (
                    <div className="py-6 text-center">
                      <span className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-teal-50 text-teal-800">
                        <Check />
                      </span>
                      <h2 className="serif text-4xl">A little further.</h2>
                      <p className="mt-4 text-sm leading-6 text-stone-500">
                        You’ve reached the end of this session.
                        <br />
                        Where will your curiosity take you next?
                      </p>
                      <Button className="mt-8" onClick={reset}>
                        Explore another topic <ArrowRight />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div
                        key={current.id}
                        className="arrive mb-10 text-center"
                      >
                        <p className="mb-5 text-[10px] font-semibold uppercase tracking-[.2em] text-stone-400">
                          Spanish word
                        </p>
                        <h2
                          lang="es"
                          className="serif break-words text-5xl text-teal-900 sm:text-6xl"
                        >
                          {current.spanish}
                        </h2>
                      </div>
                      <form onSubmit={submitAnswer}>
                        <label
                          htmlFor="answer"
                          className="mb-2 block text-xs font-medium text-stone-500"
                        >
                          Your English translation
                        </label>
                        <Input
                          ref={answerRef}
                          id="answer"
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          placeholder="Type your answer…"
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                        />
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-xs text-stone-400">
                            {3 - state.attempts}{" "}
                            {state.attempts === 2 ? "attempt" : "attempts"}{" "}
                            remaining
                          </span>
                          <span className="hidden text-[10px] text-stone-400 sm:block">
                            ENTER TO CHECK ↵
                          </span>
                        </div>
                        <div className="mt-7 flex gap-3">
                          <Button
                            type="submit"
                            className="flex-1"
                            disabled={!answer.trim()}
                          >
                            Check answer <ArrowRight />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              dispatch({ type: "skip" });
                              setAnswer("");
                              answerRef.current?.focus();
                            }}
                          >
                            Skip <SkipForward />
                          </Button>
                        </div>
                      </form>
                    </>
                  )}
                  <div
                    role="status"
                    aria-live="polite"
                    className={`mt-5 min-h-5 text-center text-sm ${state.tone === "error" ? "text-amber-800" : state.tone === "success" ? "text-teal-800" : "text-stone-500"}`}
                  >
                    {state.feedback}
                  </div>
                </div>
                <p className="mt-5 text-center text-xs text-stone-400">
                  Correct, skipped, or three attempts — then a new word.
                </p>
              </section>
            )}
          </div>
        )}
        {!result && developer && (
          <div className="mt-8 rounded-xl border border-teal-900/15 bg-teal-50/50 p-5 text-sm text-teal-900">
            <Code2 className="mb-2 size-5" />
            Developer view is on. Explore a topic to see all 150 candidates
            ranked, their exact embedding text, and similarity scores. Topic
            labels are for inspection only.
          </div>
        )}
        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-6 text-[10px] tracking-wide text-stone-400">
          <span>A SMALL EXPERIMENT IN LEARNING THROUGH CONNECTIONS</span>
          <span className="flex items-center gap-2">
            <span className="size-1 rounded-full bg-teal-600" /> MiniLM · Local
            embeddings · No tracking
          </span>
        </footer>
      </main>
    </div>
  );
}
function DeveloperView({ result }: { result: SearchResult }) {
  const [filter, setFilter] = useState("");
  const rows = result.ranked.filter((row) =>
    `${row.spanish} ${row.acceptedEnglish.join(" ")} ${row.topics.join(" ")}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-200 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-teal-800">
              <Code2 size={17} />
              <h2 className="font-semibold">Inside the search</h2>
            </div>
            <p className="max-w-2xl text-xs leading-6 text-stone-500">
              All {result.ranked.length} candidates, ranked by cosine
              similarity. The first 10 form the quiz. Labels never affect
              embeddings or ranking. Scores are similarities, not confidence
              percentages.
            </p>
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1.5 font-mono text-[10px] text-stone-500">
            {result.elapsedMs.toLocaleString()} ms
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[10px] text-stone-400">
            {result.model} · 384 dimensions · fp32
          </span>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-3 size-3.5 text-stone-400" />
            <Input
              aria-label="Filter ranked entries"
              placeholder="Filter words or labels…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>
        </div>
      </div>
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full min-w-[700px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#f7f8f5] text-[10px] uppercase tracking-wider text-stone-500">
            <tr>
              <th className="w-16 px-5 py-4">Rank</th>
              <th className="px-4 py-4">Vocabulary</th>
              <th className="w-36 px-4 py-4">Similarity</th>
              <th className="px-4 py-4">Embedded English text / labels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-stone-100 ${row.rank <= 10 ? "bg-teal-50/45" : ""}`}
              >
                <td className="px-5 py-4 align-top">
                  <span
                    className={`inline-flex size-7 items-center justify-center rounded-md font-mono text-[11px] ${row.rank <= 10 ? "bg-teal-800 text-white" : "text-stone-400"}`}
                  >
                    {row.rank}
                  </span>
                </td>
                <td className="px-4 py-4 align-top">
                  <p lang="es" className="text-sm font-semibold">
                    {row.spanish}
                  </p>
                  <p className="mt-1 leading-5 text-stone-500">
                    {row.acceptedEnglish.join(" / ")}
                  </p>
                  {row.rank <= 10 && (
                    <span className="mt-2 inline-block text-[9px] uppercase tracking-wider text-teal-700">
                      In quiz
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="font-mono text-stone-600">
                    {row.similarity.toFixed(4)}
                  </p>
                  <div className="mt-2 h-1 w-20 rounded bg-stone-100">
                    <div
                      className="h-1 rounded bg-teal-600/60"
                      style={{ width: `${Math.max(0, row.similarity) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="max-w-lg px-4 py-4">
                  <p className="leading-5 text-stone-600">{row.text}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.topics.map((topic) => (
                      <span
                        key={topic}
                        className="rounded border border-stone-200 px-1.5 py-0.5 text-[9px] text-stone-400"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-8 text-center text-sm text-stone-500">
            No entries match this filter.
          </p>
        )}
      </div>
      <div className="border-t border-stone-200 px-5 py-3 text-[10px] text-stone-400">
        Showing {rows.length} of {result.ranked.length} entries · Filtering does
        not change ranks or quiz selection · revision{" "}
        {result.revision.slice(0, 8)}
      </div>
    </section>
  );
}
