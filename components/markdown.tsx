import ReactMarkdown from "react-markdown";
export function Markdown({ text }: { text: string }) {
    return (
        <div className="prose-text">
            <ReactMarkdown
                components={{
                    img: () => null,
                    a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noreferrer">
                            {children}
                        </a>
                    ),
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}
