import { writeFile } from "node:fs/promises";
import { entries } from "../lib/catalog";
import { embed, MODEL, REVISION } from "../lib/embedding";
import { loadIndex } from "../lib/index-store";
import { rankEntries } from "../lib/rank";
async function main() {
  const index = await loadIndex();
  const cases: [string, string | null][] = [
    ["kitchen utensils", "kitchen utensils"],
    ["cooking utensils", "kitchen utensils"],
    ["utensils", "kitchen utensils"],
    ["musical instruments", "musical instruments"],
    ["music instruments", "musical instruments"],
    ["geometric shapes", "geometric shapes"],
    ["geometry shapes", "geometric shapes"],
    ["outdoor adventure", null],
    ["cold weather", null],
    ["sports equipment", null],
    ["travel", null],
    ["greetings", null],
  ];
  const report = [];
  for (const [prompt, expectedTopic] of cases) {
    const [query] = await embed([prompt]);
    const ranked = rankEntries(entries, index.vectors, query).slice(0, 10);
    const hits = expectedTopic
      ? ranked.filter((e) => e.topics.includes(expectedTopic)).length
      : null;
    report.push({
      prompt,
      expectedTopic,
      hits,
      results: ranked.map((e) => ({
        spanish: e.spanish,
        english: e.acceptedEnglish,
        similarity: e.similarity,
        topics: e.topics,
      })),
    });
    console.log(
      `${prompt}: ${hits === null ? "exploratory" : `${hits}/10 control words`} — ${ranked.map((e) => e.acceptedEnglish[0]).join(", ")}`,
    );
  }
  const [repeat] = await embed(["kitchen utensils"]);
  const repeatIds = rankEntries(entries, index.vectors, repeat)
    .slice(0, 10)
    .map((e) => e.spanish);
  if (
    JSON.stringify(repeatIds) !==
    JSON.stringify(report[0].results.map((e) => e.spanish))
  )
    throw new Error("Repeated query returned inconsistent order.");
  await writeFile(
    "data/evaluation.json",
    JSON.stringify({ model: MODEL, revision: REVISION, report }, null, 2) +
      "\n",
  );
  console.log("Saved data/evaluation.json. Repeated-query ordering is stable.");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
