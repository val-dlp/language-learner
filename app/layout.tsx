import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
    title: "Wordfield — Vocabulary Lab",
    description:
        "Explore vocabulary through semantic search. A small English–Spanish learning experiment.",
};
export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
