/** Isolated browser smoke-test server. Uses the real API; all learning data is temporary. */
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import next from "next";
import { Workspace } from "../lib/workspace/store";
import { bootstrap } from "../lib/workspace/bootstrap";
import { importDocument } from "../lib/plugins/reading/documents";
import { publishLesson } from "../lib/plugins/vocabulary/plans";
const root = await mkdtemp(path.join(os.tmpdir(), "wordfield-browser-"));
const ws = new Workspace(root);
await bootstrap(ws, root);
(globalThis as any).wordfieldWorkspace = {
    workspace: ws,
    ready: Promise.resolve(),
};
await ws.write({
    path: "home/profile.md",
    content:
        "# Browser test profile\nAn A2 English speaker learning Spanish to travel in Mexico. Either language is fine.",
});
await ws.write({
    path: "home/curriculum.md",
    content:
        "# Browser test curriculum\nPractice restaurant ordering in Mexico.",
});
for (let i = 0; i < 2; i++) {
    const draft = {
        title: `Restaurant practice ${i + 1}`,
        objective: "Order politely in a restaurant",
        constraints: "Answer in English or Spanish.",
        sourceDocuments: [
            { path: "home/profile.md", revision: 2 },
            { path: "home/curriculum.md", revision: 2 },
        ],
        questions: Array.from({ length: 10 }, (_, q) => ({
            id: `q${q}`,
            label: "At the table",
            prompt: "What does ‘la cuenta, por favor’ mean at the end of a meal?",
            rubric: {
                intendedSense: "Asking for the bill",
                essentialCriteria: ["Requesting the bill/check"],
                acceptedAlternatives: ["The check please", "Pedir la cuenta"],
                exampleAnswer: "The bill, please.",
            },
        })),
    };
    const draftPath = `plugins/vocabulary/drafts/test-${i}.json`;
    await ws.write({ path: draftPath, content: JSON.stringify(draft) }, "home");
    await publishLesson(ws, draftPath, 1);
}
// Keep a browser test's saved session from generating unneeded lessons.
await ws.write({
    path: "_system/queue-config.json",
    content: JSON.stringify({ target: 5, lowWater: 0 }),
});
await importDocument(
    ws,
    Buffer.from(
        "# Un paseo por el jardín\n\nLa niña llegó al jardín y vio una tortuga. La tortuga caminaba despacio bajo los árboles.\n\n—¿Por qué caminas tan despacio? —preguntó la niña.\n\n—Porque quiero ver todo lo que hay en el camino —respondió la tortuga.",
    ),
    "Un paseo.txt",
);
const app = next({
    dev: false,
    dir: process.cwd(),
    hostname: "127.0.0.1",
    port: 3001,
});
await app.prepare();
const server = createServer(app.getRequestHandler());
server.listen(3001, "127.0.0.1", () =>
    console.log("Isolated preview at http://127.0.0.1:3001"),
);
async function stop() {
    server.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
    process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
