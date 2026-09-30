import { describe, expect, it } from "vitest";
import { entries, searchText } from "../lib/catalog";
import { newQuiz, quizReducer } from "../lib/quiz";
import { rankEntries } from "../lib/rank";
const items = entries.slice(0, 10);
describe("quiz transitions", () => {
    it("accepts normalized answers and resets attempts on advancement", () => {
        let state = quizReducer(newQuiz(items), {
            type: "answer",
            value: "wrong",
        });
        state = quizReducer(state, { type: "answer", value: "  SPOON  " });
        expect(state.index).toBe(1);
        expect(state.attempts).toBe(0);
    });
    it("stays on the word twice, then reveals and advances on the third miss", () => {
        let state = newQuiz(items);
        for (let attempt = 1; attempt <= 2; attempt++) {
            state = quizReducer(state, { type: "answer", value: "wrong" });
            expect(state.index).toBe(0);
            expect(state.attempts).toBe(attempt);
        }
        state = quizReducer(state, { type: "answer", value: "wrong" });
        expect(state.index).toBe(1);
        expect(state.attempts).toBe(0);
        expect(state.feedback).toContain("spoon");
    });
    it("skips, accepts alternate answers, and ignores blanks", () => {
        const state = newQuiz([entries.find((e) => e.spanish === "colador")!]);
        expect(quizReducer(state, { type: "answer", value: " " })).toEqual(
            state,
        );
        expect(
            quizReducer(state, { type: "answer", value: "sieve" }).index,
        ).toBe(1);
        expect(quizReducer(state, { type: "skip" }).feedback).toContain(
            "strainer",
        );
    });
    it("finishes safely after ten entries and can reset", () => {
        let state = newQuiz(items);
        for (let i = 0; i < 10; i++)
            state = quizReducer(state, { type: "skip" });
        expect(state.index).toBe(10);
        expect(quizReducer(state, { type: "skip" })).toEqual(state);
        expect(quizReducer(state, { type: "reset", items })).toEqual(
            newQuiz(items),
        );
    });
});
describe("dictionary", () => {
    it("has 150 distinct Spanish words and complete English answers", () => {
        expect(entries).toHaveLength(150);
        expect(new Set(entries.map((e) => e.id)).size).toBe(150);
        expect(new Set(entries.map((e) => e.spanish)).size).toBe(150);
        for (const e of entries) {
            expect(e.spanish).toMatch(/^\p{L}+$/u);
            expect(e.acceptedEnglish.length).toBeGreaterThan(0);
            for (const a of e.acceptedEnglish) expect(a).toMatch(/^\p{L}+$/u);
            expect(e.description.length).toBeGreaterThan(20);
        }
    });
    it("has three isolated ten-word control groups", () => {
        for (const topic of [
            "kitchen utensils",
            "musical instruments",
            "geometric shapes",
        ]) {
            const group = entries.filter((e) => e.topics.includes(topic));
            expect(group).toHaveLength(10);
            expect(group.every((e) => e.topics.length === 1)).toBe(true);
        }
    });
    it("does not embed Spanish, labels, or identifiers", () => {
        const entry = {
            ...entries[0],
            id: "secret-id",
            spanish: "not-english",
            topics: ["secret-label"],
        };
        expect(searchText(entry)).toBe(searchText(entries[0]));
    });
});
describe("ranking", () => {
    it("ranks normalized vectors by similarity and preserves the full list", () => {
        const ranked = rankEntries(
            items.slice(0, 3),
            [
                [1, 0],
                [0, 1],
                [-1, 0],
            ],
            [1, 0],
        );
        expect(ranked.map((e) => e.similarity)).toEqual([1, 0, -1]);
        expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
    });
    it("breaks ties deterministically and rejects incompatible dimensions", () => {
        const ranked = rankEntries(
            items.slice(0, 2),
            [
                [1, 0],
                [1, 0],
            ],
            [1, 0],
        );
        expect(ranked.map((e) => e.id)).toEqual(
            items
                .slice(0, 2)
                .map((e) => e.id)
                .sort(),
        );
        expect(() => rankEntries(items.slice(0, 1), [[1]], [1, 0])).toThrow();
    });
});
