import { describe, expect, it, vi } from "vitest";
import { SessionService } from "@/lib/session-service";
import type { CheckpointStore } from "@/lib/checkpoint";
import type { Tutor } from "@/lib/tutor";
import {
    DEFAULT_LEARNER,
    type Assessment,
    type Checkpoint,
    type Command,
    type Snapshot,
    type Summary,
} from "@/lib/types";

const question = {
    prompt: "What does cuchara mean?",
    focus: "cuchara",
    rubric: {
        intendedSense: "spoon",
        essentialCriteria: ["a spoon"],
        acceptedAlternatives: ["utensil for soup"],
        exampleAnswer: "spoon",
    },
};
const assessment: Assessment = {
    outcome: "pass",
    feedback: "Yes, a spoon.",
    understanding: "Recognized cuchara unaided.",
    languageNotes: "",
    constraintMet: true,
    constraintFeedback: "",
};
const summary: Summary = {
    overview: "Practiced cuchara.",
    covered: ["cuchara: spoon"],
    demonstrated: ["Translated cuchara without help."],
    needsPractice: [],
    nextFocus: "Try another utensil.",
};
function setup(initial?: Checkpoint) {
    let disk: Checkpoint = initial ?? {
        revision: 0,
        learnerDescription: DEFAULT_LEARNER,
        logs: [],
    };
    const store: CheckpointStore = {
        load: vi.fn(async () => structuredClone(disk)),
        save: vi.fn(async (next) => {
            disk = structuredClone(next);
        }),
    };
    const tutor = {
        question: vi.fn<Tutor["question"]>(async () =>
            structuredClone(question),
        ),
        assess: vi.fn<Tutor["assess"]>(async () => structuredClone(assessment)),
        summarize: vi.fn<Tutor["summarize"]>(async () =>
            structuredClone(summary),
        ),
    };
    const service = new SessionService(store, tutor, () => true);
    return { store, tutor, service, disk: () => disk };
}
function command(
    snapshot: Snapshot,
    action: Command["action"],
    extra: Partial<Command> = {},
): Command {
    return {
        action,
        sessionId: snapshot.session!.id,
        version: snapshot.session!.version,
        ...extra,
    };
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

describe("adaptive session lifecycle", () => {
    it("prepares a rubric before assessing and saves evidence only on explicit end", async () => {
        const { service, tutor, disk } = setup();
        let state = await service.command({ action: "start" });
        expect(state.session!.evidence[0].question.rubric.exampleAnswer).toBe(
            "spoon",
        );
        state = await service.command(
            command(state, "answer", { answer: "spoon" }),
        );
        expect(disk().logs).toEqual([]);
        expect(tutor.assess.mock.calls[0][1].question.rubric).toEqual(
            question.rubric,
        );
        state = await service.command(command(state, "end"));
        expect(state.session!.status).toBe("saved");
        expect(disk().logs[0].summary).toEqual(summary);
        expect(disk().logs[0].questionsAnswered).toBe(1);
        await expect(service.command(command(state, "end"))).rejects.toThrow(
            "already saved",
        );
        expect(disk().logs).toHaveLength(1);
    });
    it("restarts from saved description and logs, discarding unsaved answers", async () => {
        const initial = {
            revision: 2,
            learnerDescription: "A2, only Spanish answers",
            logs: [
                {
                    id: "prior",
                    endedAt: "2026-09-30",
                    questionsAnswered: 1,
                    summary,
                },
            ],
        };
        const { service, tutor, store } = setup(initial);
        let state = await service.command({ action: "start" });
        state = await service.command(
            command(state, "answer", { answer: "spoon" }),
        );
        const old = state.session!.id;
        state = await service.command(command(state, "restart"));
        expect(state.session!.id).not.toBe(old);
        expect(state.session!.checkpoint).toEqual(initial);
        expect(state.session!.evidence[0].attempts).toEqual([]);
        expect(state.session!.seed).toContain("prior");
        expect(tutor.summarize).not.toHaveBeenCalled();
        expect(store.save).not.toHaveBeenCalled();
    });
    it("ignores an assessment that completes after restart, even if the provider ignores abort", async () => {
        const { service, tutor, disk } = setup();
        const delay = deferred<Assessment>();
        tutor.assess.mockImplementationOnce(() => delay.promise);
        const state = await service.command({ action: "start" });
        const pending = service.command(
            command(state, "answer", { answer: "spoon" }),
        );
        const rejection = expect(pending).rejects.toThrow("discarded");
        await vi.waitFor(() => expect(tutor.assess).toHaveBeenCalled());
        const restarted = await service.command(command(state, "restart"));
        expect(tutor.assess.mock.calls[0][3].aborted).toBe(true);
        delay.resolve(assessment);
        await rejection;
        expect((await service.get()).session!.id).toBe(restarted.session!.id);
        expect((await service.get()).session!.evidence[0].attempts).toEqual([]);
        expect(disk().logs).toEqual([]);
    });
    it("cannot save a delayed summary after the session is discarded", async () => {
        const { service, tutor, disk } = setup();
        let state = await service.command({ action: "start" });
        state = await service.command(command(state, "skip"));
        const delay = deferred<Summary>();
        tutor.summarize.mockImplementationOnce(() => delay.promise);
        const pending = service.command(command(state, "end"));
        const rejection = expect(pending).rejects.toThrow("discarded");
        await vi.waitFor(() => expect(tutor.summarize).toHaveBeenCalled());
        await service.command(command(state, "restart"));
        delay.resolve(summary);
        await rejection;
        expect(disk().logs).toEqual([]);
    });
    it("retains retries as assisted evidence and resolves after three adjustments", async () => {
        const { service, tutor } = setup();
        tutor.assess.mockImplementation(async () => ({
            ...assessment,
            outcome: "needs_adjustment",
        }));
        let state = await service.command({ action: "start" });
        for (let i = 0; i < 3; i++)
            state = await service.command(
                command(state, "answer", { answer: "fork" }),
            );
        expect(state.session!.evidence[0].resolved).toBe(true);
        expect(
            state.session!.evidence[0].attempts.map((a) => a.assisted),
        ).toEqual([false, true, true]);
        await expect(
            service.command(command(state, "answer", { answer: "fork" })),
        ).rejects.toThrow("no question");
    });
    it("retains meaning evidence when an explicit answer-language constraint needs adjustment", async () => {
        const { service, tutor } = setup();
        tutor.assess.mockResolvedValueOnce({
            ...assessment,
            constraintMet: false,
            constraintFeedback: "Please answer in Spanish.",
        });
        let state = await service.command({ action: "start" });
        state = await service.command(
            command(state, "answer", { answer: "spoon" }),
        );
        const evidence = state.session!.evidence[0];
        expect(evidence.resolved).toBe(false);
        expect(evidence.attempts[0].assessment.understanding).toBe(
            assessment.understanding,
        );
        expect(evidence.attempts[0].assessment.outcome).toBe(
            "needs_adjustment",
        );
    });
    it("rejects stale/double answers and caps the session at ten questions", async () => {
        const { service, tutor } = setup();
        let state = await service.command({ action: "start" });
        const old = command(state, "answer", { answer: "spoon" });
        state = await service.command(old);
        await expect(service.command(old)).rejects.toThrow("out of date");
        for (let i = 1; i < 10; i++) {
            state = await service.command(command(state, "next"));
            state = await service.command(command(state, "skip"));
        }
        await expect(service.command(command(state, "next"))).rejects.toThrow(
            "ten questions",
        );
        expect(tutor.question).toHaveBeenCalledTimes(10);
    });
    it("keeps the checkpoint intact on failed save and allows retry", async () => {
        const { service, store, disk } = setup();
        let state = await service.command({ action: "start" });
        state = await service.command(command(state, "skip"));
        vi.mocked(store.save).mockRejectedValueOnce(new Error("disk full"));
        await expect(service.command(command(state, "end"))).rejects.toThrow(
            "failed",
        );
        expect(disk().logs).toEqual([]);
        state = await service.get();
        expect(state.session!.busy).toBe(false);
        state = await service.command(command(state, "end"));
        expect(state.checkpoint.logs).toHaveLength(1);
    });
    it("changes the seed while preserving logs and discarding the active evidence", async () => {
        const { service } = setup();
        let state = await service.command({ action: "start" });
        state = await service.command(command(state, "skip"));
        state = await service.command(
            command(state, "restart", {
                learnerDescription: "B1, kitchen vocabulary, Spanish only",
            }),
        );
        expect(state.checkpoint.learnerDescription).toContain("B1");
        expect(state.checkpoint.logs).toEqual([]);
        expect(state.session!.seed).toContain("Spanish only");
        expect(state.session!.evidence[0].skipped).toBe(false);
    });
    it("does not fabricate a log when ending an unanswered session", async () => {
        const { service, tutor, disk } = setup();
        const state = await service.command({ action: "start" });
        await service.command(command(state, "end"));
        expect(tutor.summarize).not.toHaveBeenCalled();
        expect(disk().logs).toEqual([]);
    });
    it("a new service restores only the checkpoint, never a partial session", async () => {
        const { service, store, tutor } = setup();
        let state = await service.command({ action: "start" });
        state = await service.command(command(state, "skip"));
        await service.command(command(state, "end"));
        await service.command({ action: "start" });
        const recovered = await new SessionService(
            store,
            tutor,
            () => true,
        ).get();
        expect(recovered.session).toBeNull();
        expect(recovered.checkpoint.logs).toHaveLength(1);
    });
});
