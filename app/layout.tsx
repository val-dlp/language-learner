import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
    title: "Wordfield — Vocabulary Lab",
    description:
        "Adaptive vocabulary practice through free-form answers and evidence-based feedback.",
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
