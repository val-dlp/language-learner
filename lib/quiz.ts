import type { QuizItem } from "./types";
export const normalizeAnswer = (value: string) =>
  value.normalize("NFC").trim().toLocaleLowerCase("en");
export type QuizState = {
  items: QuizItem[];
  index: number;
  attempts: number;
  feedback: string;
  tone: "neutral" | "success" | "error";
};
export function newQuiz(items: QuizItem[]): QuizState {
  return { items, index: 0, attempts: 0, feedback: "", tone: "neutral" };
}
export type QuizAction =
  | { type: "answer"; value: string }
  | { type: "skip" }
  | { type: "reset"; items: QuizItem[] };
export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  if (action.type === "reset") return newQuiz(action.items);
  const current = state.items[state.index];
  if (!current) return state;
  const advance = (feedback: string, tone: QuizState["tone"]): QuizState => ({
    ...state,
    index: state.index + 1,
    attempts: 0,
    feedback,
    tone,
  });
  const reveal = `${current.spanish} → ${current.acceptedEnglish.join(" / ")}`;
  if (action.type === "skip") return advance(`Skipped: ${reveal}`, "neutral");
  const answer = normalizeAnswer(action.value);
  if (!answer) return state;
  if (
    current.acceptedEnglish.some((value) => normalizeAnswer(value) === answer)
  )
    return advance(`Correct: ${reveal}`, "success");
  const attempts = state.attempts + 1;
  if (attempts === 3) return advance(`Answer: ${reveal}`, "neutral");
  return {
    ...state,
    attempts,
    feedback: `Not quite. ${3 - attempts} ${attempts === 2 ? "attempt" : "attempts"} left.`,
    tone: "error",
  };
}
