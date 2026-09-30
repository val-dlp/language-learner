export type Entry = {
  id: string;
  spanish: string;
  acceptedEnglish: string[];
  description: string;
  topics: string[];
};
export type QuizItem = Pick<Entry, "id" | "spanish" | "acceptedEnglish">;
export type RankedEntry = Entry & {
  rank: number;
  similarity: number;
  text: string;
};
export type SearchResult = {
  topic: string;
  items: QuizItem[];
  ranked: RankedEntry[];
  model: string;
  revision: string;
  elapsedMs: number;
};
