"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Code2, Layers3 } from "lucide-react";
import { Button } from "./ui/button";
import { Inspector } from "./developer/inspector";
export function AppShell({ children }: { children: React.ReactNode }) {
    const path = usePathname();
    const [developer, setDeveloper] = useState(false);
    const [document, setDocument] = useState<string | undefined>();
    useEffect(() => {
        const open = (event: Event) => {
            setDocument((event as CustomEvent<string>).detail);
            setDeveloper(true);
            setTimeout(
                () =>
                    window.document
                        .getElementById("workspace-inspector")
                        ?.scrollIntoView({ behavior: "smooth" }),
                50,
            );
        };
        window.addEventListener("wordfield:document", open);
        return () => window.removeEventListener("wordfield:document", open);
    }, []);
    return (
        <div className="mx-auto max-w-[1440px] px-5 pb-12 sm:px-10">
            <header className="app-header">
                <Link href="/" className="flex items-center gap-3">
                    <span className="rounded-xl bg-teal-900 p-2.5 text-white">
                        <Layers3 className="size-5" />
                    </span>
                    <span className="serif text-3xl tracking-tight">
                        wordfield<span className="text-teal-700">.</span>
                    </span>
                </Link>
                <nav
                    className="flex gap-1 text-sm"
                    aria-label="Main navigation"
                >
                    {[
                        ["/", "Home"],
                        ["/vocabulary", "Vocabulary"],
                        ["/reading", "Reading"],
                    ].map(([href, label]) => (
                        <Link
                            key={href}
                            href={href}
                            className={`rounded-lg px-3 py-2 ${path === href || (href !== "/" && path.startsWith(href)) ? "bg-teal-50 text-teal-900" : "text-stone-500 hover:bg-stone-100"}`}
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
                <Button
                    size="sm"
                    variant={developer ? "default" : "ghost"}
                    aria-pressed={developer}
                    onClick={() => setDeveloper(!developer)}
                >
                    <Code2 />
                    <span className="hidden sm:inline">Developer view</span>
                </Button>
            </header>
            {children}
            {developer && <Inspector initialPath={document} />}
        </div>
    );
}
