import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Workspace } from "@/lib/workspace/store";
import { bootstrap } from "@/lib/workspace/bootstrap";
import { publishLesson } from "@/lib/plugins/vocabulary/plans";
import { QuizService } from "@/lib/plugins/vocabulary/service";
import { HomeService } from "@/lib/home/service";
import { RefillWorker } from "@/lib/home/refill";
import {
    QUEUE_PATH,
    emptyQueue,
    type Grade,
    type LessonDraft,
} from "@/lib/plugins/vocabulary/schema";
const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0))
        await rm(root, { recursive: true, force: true });
});
const pass: Grade = {
    outcome: "pass",
    feedback: "Correct",
    understanding: "understood",
    languageNotes: "",
    constraintMet: true,
    constraintFeedback: "",
};
async function setup() {
    const root = await mkdtemp(path.join(os.tmpdir(), "wordfield-practice-"));
    roots.push(root);
    const ws = new Workspace(root);
    await bootstrap(ws, root);
    const draft: LessonDraft = {
        title: "Travel",
        objective: "Ask for directions",
        constraints: "Either language",
        sourceDocuments: [
            { path: "home/profile.md", revision: 1 },
            { path: "home/curriculum.md", revision: 1 },
        ],
        questions: Array.from({ length: 10 }, (_, i) => ({
            id: `q${i}`,
            label: "Directions",
            prompt: "What is calle?",
            rubric: {
                intendedSense: "street",
                essentialCriteria: ["street"],
                acceptedAlternatives: [],
                exampleAnswer: "street",
            },
        })),
    };
    await ws.write(
        {
            path: "plugins/vocabulary/drafts/test.json",
            content: JSON.stringify(draft),
        },
        "home",
    );
    const plan = await publishLesson(
        ws,
        "plugins/vocabulary/drafts/test.json",
        1,
    );
    return { ws, plan };
}
it("freezes validated plans, deduplicates publication, and rejects stale source revisions", async () => {
    const { ws, plan } = await setup();
    expect(
        await publishLesson(ws, "plugins/vocabulary/drafts/test.json", 1),
    ).toMatchObject({ duplicate: true, planId: plan.planId });
    await ws.write(
        { path: "home/profile.md", content: "Changed", expectedRevision: 1 },
        "user",
    );
    await expect(
        publishLesson(ws, "plugins/vocabulary/drafts/test.json", 1),
    ).rejects.toThrow("Source changed");
});
it("restarts discard answers, preserve the plan, and reject late grades", async () => {
    const { ws, plan } = await setup();
    let release!: (grade: Grade) => void;
    const quiz = new QuizService(
        ws,
        () =>
            new Promise((resolve) => {
                release = resolve;
            }),
    );
    const first = (await quiz.start()).active!;
    const inFlight = quiz.answer(first.id, first.version, "old answer");
    while (!release) await new Promise((r) => setTimeout(r, 5));
    const second = (await quiz.act("restart", first.id, first.version)).active!;
    release(pass);
    await inFlight;
    const current = (await quiz.view()).active!;
    expect(current.id).toBe(second.id);
    expect(current.planId).toBe(plan.planId);
    expect(current.replays).toBe(1);
    expect(current.evidence.attempts).toHaveLength(0);
    expect((await ws.list()).some((d) => d.path.includes("/sessions/"))).toBe(
        false,
    );
    expect((await quiz.view()).ready).toBe(0);
});
it("saves exact evidence once and creates a durable refill event; provider failures use no attempt", async () => {
    const { ws } = await setup();
    let fail = true;
    const quiz = new QuizService(ws, async () => {
        if (fail) throw new Error("provider");
        return pass;
    });
    let s = (await quiz.start()).active!;
    await expect(quiz.answer(s.id, s.version, "street")).rejects.toThrow(
        "model request",
    );
    s = (await quiz.view()).active!;
    expect(s.evidence.attempts).toHaveLength(0);
    fail = false;
    s = (await quiz.answer(s.id, s.version, "street")).active!;
    const saved = await quiz.act("finish", s.id, s.version);
    const evidence = JSON.parse(
        (
            await ws.read(
                `plugins/vocabulary/sessions/${saved.lastSaved}/evidence.json`,
            )
        ).content,
    );
    expect(evidence.evidence[0].attempts[0]).toMatchObject({
        answer: "street",
        assessment: pass,
        assisted: false,
    });
    expect(evidence.evidence[1].attempts).toHaveLength(0);
    await expect(quiz.act("finish", s.id, s.version)).rejects.toThrow(
        "changed",
    );
    expect(
        JSON.parse((await ws.read("_system/refill.json")).content).status,
    ).toBe("pending");
});
it("bounds attempts and distinguishes skipped from unanswered questions", async () => {
    const { ws } = await setup();
    const quiz = new QuizService(ws, async () => ({
        ...pass,
        outcome: "needs_adjustment",
    }));
    let s = (await quiz.start()).active!;
    for (let i = 0; i < 3; i++)
        s = (await quiz.answer(s.id, s.version, "wrong")).active!;
    expect(s.evidence.resolved).toBe(true);
    expect(s.evidence.attempts[1].assisted).toBe(true);
    await expect(quiz.answer(s.id, s.version, "fourth")).rejects.toThrow(
        "finished",
    );
    s = (await quiz.act("next", s.id, s.version)).active!;
    s = (await quiz.act("skip", s.id, s.version)).active!;
    expect(s.index).toBe(2);
    const saved = await quiz.act("finish", s.id, s.version);
    const evidence = JSON.parse(
        (
            await ws.read(
                `plugins/vocabulary/sessions/${saved.lastSaved}/evidence.json`,
            )
        ).content,
    );
    expect(evidence.evidence[1].skipped).toBe(true);
    expect(evidence.evidence[2].skipped).toBe(false);
});
it("recovers an interrupted refill, coalesces concurrent kicks, and does not retry failure on navigation", async () => {
    const { ws } = await setup();
    let calls = 0;
    await ws.write({
        path: "_system/refill.json",
        content: JSON.stringify({
            id: "job",
            status: "running",
            latestSession: "saved",
            createdAt: "now",
        }),
    });
    const home = new HomeService(ws, async () => {
        calls++;
        throw new Error("offline");
    });
    const worker = new RefillWorker(ws, home);
    await Promise.all([worker.kick(), worker.kick()]);
    expect(calls).toBe(1);
    expect((await worker.status())?.status).toBe("failed");
    await worker.kick();
    expect(calls).toBe(1);
    await worker.retry();
    await worker.kick();
    expect(calls).toBe(2);
});

it("refills only after the fourth saved lesson and reads durable evidence before planning", async () => {
    const { ws } = await setup();
    const draft = JSON.parse(
        (await ws.read("plugins/vocabulary/drafts/test.json")).content,
    );
    async function publish(title: string) {
        const path = `plugins/vocabulary/drafts/${title}.json`;
        await ws.write(
            { path, content: JSON.stringify({ ...draft, title }) },
            "home",
        );
        return publishLesson(ws, path, 1);
    }
    for (let i = 0; i < 4; i++) await publish(`initial-${i}`);
    let calls = 0;
    const home = new HomeService(ws, async () => {
        calls++;
        const evidence = (await ws.list("home")).filter((d) =>
            d.path.endsWith("/evidence.json"),
        );
        expect(evidence).toHaveLength(4);
        expect(
            JSON.parse((await ws.read(evidence[3].path, "home")).content)
                .evidence[0].attempts[0].answer,
        ).toBe("street");
        for (let i = 0; i < 4; i++) await publish(`refill-${i}`);
        return { text: "Prepared four new lessons.", usage: null };
    });
    const worker = new RefillWorker(ws, home),
        quiz = new QuizService(ws, async () => pass);
    for (let i = 0; i < 4; i++) {
        let active = (await quiz.start()).active!;
        active = (await quiz.answer(active.id, active.version, "street"))
            .active!;
        await quiz.act("finish", active.id, active.version);
        if (i < 3) {
            await worker.kick();
            expect(calls).toBe(0);
        }
    }
    expect((await worker.status())?.status).toBe("pending");
    await Promise.all([worker.kick(), worker.kick()]);
    expect(calls).toBe(1);
    expect((await worker.status())?.status).toBe("completed");
    expect((await quiz.view()).ready).toBe(5);
});
it("keeps grading context private and records developer exposure before a lesson starts", async () => {
    const { ws } = await setup();
    const quiz = new QuizService(ws, async (input) => {
        input.onDiagnostics?.({ privateRubric: "secret" });
        return pass;
    });
    await quiz.expose();
    let active = (await quiz.start()).active!;
    expect(active.developerExposed).toBe(true);
    active = (await quiz.answer(active.id, active.version, "street")).active!;
    expect(JSON.stringify(active)).not.toContain("secret");
    const saved = await quiz.act("finish", active.id, active.version);
    expect(
        (
            await ws.read(
                `plugins/vocabulary/sessions/${saved.lastSaved}/evidence.json`,
            )
        ).content,
    ).toContain("privateRubric");
});
