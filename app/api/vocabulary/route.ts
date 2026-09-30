import { entries } from "@/lib/catalog";
import { embed, MODEL, REVISION } from "@/lib/embedding";
import { loadIndex } from "@/lib/index-store";
import { rankEntries } from "@/lib/rank";
export const runtime = "nodejs";
export async function POST(request: Request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json(
            { error: "Enter a topic to start." },
            { status: 400 },
        );
    }
    const topic =
        typeof body?.topic === "string"
            ? body.topic.normalize("NFC").trim().replace(/\s+/g, " ")
            : "";
    if (!topic || topic.length > 80 || topic.split(" ").length > 2)
        return Response.json(
            { error: "Use one or two English words, up to 80 characters." },
            { status: 400 },
        );
    try {
        const started = performance.now();
        const index = await loadIndex();
        if (entries.length < 10)
            throw new Error("The dictionary needs at least 10 entries.");
        const [query] = await embed([topic.toLocaleLowerCase("en")]);
        const ranked = rankEntries(entries, index.vectors, query);
        return Response.json({
            topic,
            ranked,
            items: ranked
                .slice(0, 10)
                .map(({ id, spanish, acceptedEnglish }) => ({
                    id,
                    spanish,
                    acceptedEnglish,
                })),
            model: MODEL,
            revision: REVISION,
            elapsedMs: Math.round(performance.now() - started),
        });
    } catch (error) {
        console.error(error);
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not retrieve vocabulary. Please retry.",
            },
            { status: 503 },
        );
    }
}
