"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import type { RefillJob } from "@/lib/home/refill";
export function LessonQueue({ settings = false }: { settings?: boolean }) {
    const [data, setData] = useState<{
        queue: { ready: string[] };
        config: { target: number; lowWater: number };
        refill: RefillJob | null;
    } | null>(null);
    const [target, setTarget] = useState(5),
        [lowWater, setLowWater] = useState(1),
        [error, setError] = useState("");
    const refresh = useCallback(async () => {
        const r = await fetch("/api/home");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
    }, []);
    useEffect(() => {
        refresh().catch((e) => setError(e.message));
        const timer = setInterval(() => refresh().catch(() => {}), 5000);
        return () => clearInterval(timer);
    }, [refresh]);
    useEffect(() => {
        if (data) {
            setTarget(data.config.target);
            setLowWater(data.config.lowWater);
        }
    }, [data?.config.target, data?.config.lowWater]);
    async function act(action: string) {
        setError("");
        try {
            const r = await fetch("/api/home", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, config: { target, lowWater } }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            await refresh();
        } catch (e) {
            setError(String(e));
        }
    }
    return (
        <div className="mt-4 text-sm">
            <p className="text-teal-800">
                {data?.queue.ready.length ?? 0} of {data?.config.target ?? 5}{" "}
                lessons ready
            </p>
            {data?.refill &&
                ["pending", "running"].includes(data.refill.status) && (
                    <div className="mt-2 flex items-center gap-3 text-xs text-stone-500">
                        {data.refill.status === "pending"
                            ? "Home will replenish your lessons when it is available."
                            : "Home is preparing more lessons…"}
                        <button
                            className="underline"
                            onClick={() => act("cancel_refill")}
                        >
                            Cancel
                        </button>
                    </div>
                )}
            {data?.refill &&
                ["failed", "cancelled"].includes(data.refill.status) && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs">
                        <p>{data.refill.error}</p>
                        <button
                            className="mt-2 text-teal-700 underline"
                            onClick={() => act("retry_refill")}
                        >
                            Retry refill
                        </button>
                    </div>
                )}
            {settings && (
                <form
                    className="mt-4 flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        act("configure_queue");
                    }}
                >
                    <label className="text-xs">
                        Ready lesson target
                        <input
                            className="field mt-1 w-24"
                            type="number"
                            min={2}
                            max={20}
                            value={target}
                            onChange={(e) => setTarget(Number(e.target.value))}
                        />
                    </label>
                    <label className="text-xs">
                        Refill at or below
                        <input
                            className="field mt-1 w-24"
                            type="number"
                            min={0}
                            max={19}
                            value={lowWater}
                            onChange={(e) =>
                                setLowWater(Number(e.target.value))
                            }
                        />
                    </label>
                    <Button variant="outline" size="sm">
                        Save queue settings
                    </Button>
                </form>
            )}
            {error && <p className="notice mt-3">{error}</p>}
        </div>
    );
}
