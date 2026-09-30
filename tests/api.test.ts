import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/embedding", () => ({
    embed: vi.fn(async () => [[1, 0]]),
    MODEL: "test",
    REVISION: "test",
}));
vi.mock("../lib/index-store", () => ({
    loadIndex: vi.fn(async () => ({
        vectors: Array.from({ length: 150 }, () => [1, 0]),
    })),
}));
// Next's @ alias is resolved by Vitest's config.
import { POST } from "../app/api/vocabulary/route";
const request = (body: unknown) =>
    new Request("http://localhost/api/vocabulary", {
        method: "POST",
        body: JSON.stringify(body),
    });
describe("vocabulary API", () => {
    it.each([
        {},
        null,
        { topic: "" },
        { topic: "one two three" },
        { topic: 123 },
        { topic: "a".repeat(81) },
    ])("rejects invalid input %j", async (body) => {
        expect((await POST(request(body))).status).toBe(400);
    });
    it("returns ten quiz words and all ranked candidates", async () => {
        const response = await POST(
            request({ topic: "  kitchen   utensils  " }),
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.topic).toBe("kitchen utensils");
        expect(data.items).toHaveLength(10);
        expect(data.ranked).toHaveLength(150);
    });
});
