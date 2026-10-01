"use client";
import ReactMarkdown from "react-markdown";
export function openDocument(path: string) {
    window.dispatchEvent(
        new CustomEvent("wordfield:document", { detail: path }),
    );
}
export function Markdown({ text }: { text: string }) {
    return (
        <div className="prose-text">
            <ReactMarkdown
                components={{
                    img: () => null,
                    a: ({ children, href }) => {
                        const path = href?.replace(/^\.?\//, "");
                        return path &&
                            /^(home\/|plugins\/|_system\/|INDEX\.md$)/.test(
                                path,
                            ) ? (
                            <button
                                className="text-teal-700 underline"
                                onClick={() => openDocument(path)}
                            >
                                {children}
                            </button>
                        ) : (
                            <a href={href} target="_blank" rel="noreferrer">
                                {children}
                            </a>
                        );
                    },
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}
