import { writeFile, rename } from "node:fs/promises";
import { entries, searchText } from "../lib/catalog";
import { embed, MODEL, REVISION, DTYPE, DIMENSIONS } from "../lib/embedding";
import { fingerprint } from "../lib/index-store";
async function main() {
    console.log(
        `Embedding ${entries.length} entries with ${MODEL} (${DTYPE}). First run downloads the model.`,
    );
    const vectors: number[][] = [];
    for (let i = 0; i < entries.length; i += 16) {
        vectors.push(
            ...(await embed(entries.slice(i, i + 16).map(searchText))),
        );
        console.log(`${vectors.length}/${entries.length}`);
    }
    await writeFile(
        "data/embeddings.json.tmp",
        JSON.stringify({
            model: MODEL,
            revision: REVISION,
            dtype: DTYPE,
            dimensions: DIMENSIONS,
            fingerprint: fingerprint(),
            vectors,
        }),
    );
    await rename("data/embeddings.json.tmp", "data/embeddings.json");
    console.log("Saved data/embeddings.json");
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
