"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { plugins } from "@/lib/plugins/registry";
export default function Home() {
    const [profile, setProfile] = useState("");
    const [curriculum, setCurriculum] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        Promise.all(
            ["home/profile.md", "home/curriculum.md"].map(async (path) => {
                const r = await fetch(
                    `/api/workspace?path=${encodeURIComponent(path)}`,
                );
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                return d.content;
            }),
        )
            .then(([p, c]) => {
                setProfile(p);
                setCurriculum(c);
            })
            .catch((e) => setError(e.message));
    }, []);
    return (
        <main className="py-10">
            <p className="eyebrow">Your learning, with direction</p>
            <h1 className="serif mt-3 text-4xl sm:text-5xl">
                What would you like to do
                <br />
                <span className="text-teal-800">with your Spanish?</span>
            </h1>
            {error && <p className="notice mt-5">{error}</p>}
            <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
                <section className="panel p-7">
                    <MessageCircle className="mb-5 size-6 text-teal-700" />
                    <h2 className="serif text-2xl">
                        Meet your learning guide.
                    </h2>
                    <p className="mt-4 leading-7 text-stone-600">
                        Home keeps your goals, plans your practice, and learns
                        from the evidence you bring back. Your profile and
                        curriculum live in editable documents.
                    </p>
                    <p className="mt-6 text-sm text-stone-500">
                        The planning conversation is the next step in this
                        refactor. Your existing vocabulary tutor is still
                        available.
                    </p>
                </section>
                <aside className="space-y-5">
                    <section className="panel p-6">
                        <h2 className="serif mb-4 text-2xl">Practice spaces</h2>
                        {plugins.map((plugin) => (
                            <Link
                                className="group mb-3 block rounded-xl border border-stone-200 p-4 hover:border-teal-500"
                                href={plugin.route}
                                key={plugin.id}
                            >
                                <div className="flex items-center justify-between font-semibold">
                                    {plugin.title}
                                    <ArrowUpRight className="size-4" />
                                </div>
                                <p className="mt-2 text-sm leading-6 text-stone-500">
                                    {plugin.description}
                                </p>
                            </Link>
                        ))}
                    </section>
                    <details className="panel p-6" open>
                        <summary className="serif cursor-pointer text-xl">
                            Your learning direction
                        </summary>
                        <div className="mt-4">
                            <Markdown text={curriculum || "Loading…"} />
                        </div>
                    </details>
                    <details className="panel p-6">
                        <summary className="serif cursor-pointer text-xl">
                            Your profile
                        </summary>
                        <div className="mt-4">
                            <Markdown text={profile} />
                        </div>
                    </details>
                </aside>
            </div>
        </main>
    );
}
