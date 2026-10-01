"use client";
import { useState } from "react";
import type { HomeRun } from "@/lib/home/service";
import { Button } from "@/components/ui/button";
export function RunInspector() {
    const [run, setRun] = useState<HomeRun | null>(null),
        [error, setError] = useState("");
    async function refresh() {
        try {
            const r = await fetch("/api/home?trace=1");
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setRun(data);
            setError(data ? "" : "No Home run yet.");
        } catch (e) {
            setError(String(e));
        }
    }
    return (
        <details className="mb-5">
            <summary className="cursor-pointer text-sm font-medium">
                Home run: context & tools
            </summary>
            <div className="mt-3">
                <p className="mb-3 text-xs text-stone-500">
                    Exact input, tool results, timing, usage, and
                    provider-supplied reasoning summaries when available.
                    Private chain-of-thought is not exposed. This can reveal
                    lesson answers.
                </p>
                <Button variant="outline" size="sm" onClick={refresh}>
                    Inspect latest run
                </Button>
                {error && <p className="mt-3 text-sm">{error}</p>}
                {run && (
                    <>
                        <p className="my-3 text-xs">
                            {run.model} · {run.effort} reasoning · {run.status}{" "}
                            · {run.tools.length} tool calls
                        </p>
                        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 text-xs">
                            {JSON.stringify(run, null, 2)}
                        </pre>
                    </>
                )}
            </div>
        </details>
    );
}
