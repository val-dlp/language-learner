import type { Entry, RankedEntry } from "./types";
import { searchText } from "./catalog";
export function rankEntries(
  entries: Entry[],
  vectors: number[][],
  query: number[],
): RankedEntry[] {
  if (entries.length !== vectors.length)
    throw new Error("Vocabulary and vector counts differ.");
  return entries
    .map((entry, index) => {
      const vector = vectors[index];
      if (vector.length !== query.length)
        throw new Error("Embedding dimensions differ.");
      const similarity = vector.reduce(
        (sum, value, i) => sum + value * query[i],
        0,
      );
      return { ...entry, text: searchText(entry), similarity, rank: 0 };
    })
    .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id))
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
