import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tutor/route";

const shared = globalThis as typeof globalThis & { wordfieldService?: unknown };
afterEach(() => {
    delete shared.wordfieldService;
});
describe("tutor API boundary", () => {
    it("accepts the browser Host even when Next normalizes the request URL", async () => {
        const command = vi.fn(async () => ({ ok: true }));
        shared.wordfieldService = { command };
        const response = await POST(
            new Request("http://localhost:3000/api/tutor", {
                method: "POST",
                headers: {
                    origin: "http://127.0.0.1:3000",
                    host: "127.0.0.1:3000",
                },
                body: JSON.stringify({ action: "start" }),
            }),
        );
        expect(response.status).toBe(200);
        expect(command).toHaveBeenCalledWith({ action: "start" });
    });
    it.each(["https://unrelated.example", "null", "not a URL"])(
        "rejects an unrelated or invalid origin: %s",
        async (origin) => {
            const response = await POST(
                new Request("http://localhost:3000/api/tutor", {
                    method: "POST",
                    headers: { origin, host: "localhost:3000" },
                    body: "{}",
                }),
            );
            expect(response.status).toBe(403);
        },
    );
    it("rejects oversized answers and never calls the service", async () => {
        const command = vi.fn();
        shared.wordfieldService = { command };
        const response = await POST(
            new Request("http://localhost:3000/api/tutor", {
                method: "POST",
                body: JSON.stringify({
                    action: "answer",
                    answer: "a".repeat(6001),
                }),
            }),
        );
        expect(response.status).toBe(400);
        expect(command).not.toHaveBeenCalled();
    });
});
