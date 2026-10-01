import { expect, it } from "vitest";
import { body, checkOrigin } from "@/lib/http";
import { GET } from "@/app/api/tutor/route";
it("accepts the browser Host when Next normalizes the request URL", () => {
    expect(() =>
        checkOrigin(
            new Request("http://localhost:3000/api/home", {
                headers: {
                    origin: "http://127.0.0.1:3000",
                    host: "127.0.0.1:3000",
                },
            }),
        ),
    ).not.toThrow();
});
it.each(["https://unrelated.example", "null", "not a URL"])(
    "rejects an unrelated origin: %s",
    (origin) => {
        expect(() =>
            checkOrigin(
                new Request("http://localhost:3000/api/home", {
                    headers: { origin, host: "localhost:3000" },
                }),
            ),
        ).toThrow("Cross-origin");
    },
);
it("bounds JSON input and retires writes to the old checkpoint API", async () => {
    await expect(
        body(
            new Request("http://localhost:3000/api/home", {
                method: "POST",
                body: "x".repeat(250001),
            }),
        ),
    ).rejects.toThrow("too large");
    expect(GET().status).toBe(410);
});
