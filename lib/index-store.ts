import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { entries, searchText } from "./catalog";
import { MODEL, REVISION, DIMENSIONS, DTYPE } from "./embedding";
export function fingerprint() {
    return createHash("sha256")
        .update(JSON.stringify(entries.map((e) => [e.id, searchText(e)])))
        .digest("hex");
}
export type VectorIndex = {
    model: string;
    revision: string;
    dtype: string;
    dimensions: number;
    fingerprint: string;
    vectors: number[][];
};
let cached: Promise<VectorIndex> | undefined;
export async function loadIndex(): Promise<VectorIndex> {
    return (cached ??= (async () => {
        let data: VectorIndex;
        try {
            data = JSON.parse(
                await readFile(
                    path.join(process.cwd(), "data", "embeddings.json"),
                    "utf8",
                ),
            );
        } catch {
            throw new Error(
                "Vocabulary embeddings are missing. Run npm run embed, then restart the app.",
            );
        }
        if (
            data.model !== MODEL ||
            data.revision !== REVISION ||
            data.dtype !== DTYPE ||
            data.dimensions !== DIMENSIONS ||
            data.fingerprint !== fingerprint() ||
            data.vectors.length !== entries.length
        )
            throw new Error(
                "Vocabulary embeddings are out of date. Run npm run embed, then restart the app.",
            );
        if (
            data.vectors.some(
                (v) =>
                    v.length !== DIMENSIONS ||
                    v.some((n) => !Number.isFinite(n)) ||
                    Math.abs(Math.hypot(...v) - 1) > 0.001,
            )
        )
            throw new Error("Invalid embedding vectors. Run npm run embed.");
        return data;
    })().catch((error) => {
        cached = undefined;
        throw error;
    }));
}
