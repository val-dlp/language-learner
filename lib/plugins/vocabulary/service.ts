import type { Workspace } from "@/lib/workspace/store";
import { WorkspaceError } from "@/lib/workspace/files";
import { modelError } from "@/lib/models/config";
import { gradeAnswer, type Grader } from "./grader";
import {
    DEFAULT_QUEUE_CONFIG,
    QUEUE_PATH,
    emptyQueue,
    type Lesson,
    type QuizSession,
} from "./schema";
import { JOB_PATH, requestRefill, type RefillJob } from "@/lib/home/refill";
export class QuizService {
    private controller: AbortController | null = null;
    private ready: Promise<unknown>;
    constructor(
        private ws: Workspace,
        private grade: Grader = gradeAnswer,
    ) {
        this.ready = ws.mutate(async (tx) => {
            const state = await tx.get(QUEUE_PATH, emptyQueue());
            if (state.active?.busy) {
                state.active.busy = false;
                state.active.version++;
                tx.put({ path: QUEUE_PATH, content: JSON.stringify(state) });
            }
        });
    }
    async view() {
        await this.ready;
        const state = await this.ws.mutate((tx) =>
            tx.get(QUEUE_PATH, emptyQueue()),
        );
        const s = state.active;
        return {
            ready: state.ready.length,
            active: s
                ? {
                      id: s.id,
                      version: s.version,
                      planId: s.plan.planId,
                      title: s.plan.title,
                      objective: s.plan.objective,
                      constraints: s.plan.constraints,
                      index: s.index,
                      total: s.plan.questions.length,
                      question: {
                          id: s.plan.questions[s.index].id,
                          label: s.plan.questions[s.index].label,
                          prompt: s.plan.questions[s.index].prompt,
                      },
                      evidence: s.evidence[s.index],
                      busy: s.busy,
                      replays: s.replays,
                      developerExposed: s.developerExposed,
                  }
                : null,
            lastSaved: state.lastSaved,
        };
    }
    async start() {
        await this.ready;
        await this.ws.mutate(async (tx) => {
            const state = await tx.get(QUEUE_PATH, emptyQueue());
            if (state.active) return;
            const id = state.ready.shift();
            if (!id)
                throw new WorkspaceError(
                    "No prepared lesson is ready. Ask Home to prepare your next lessons.",
                    409,
                );
            const plan = await tx.get<Lesson | null>(
                `plugins/vocabulary/plans/${id}.json`,
                null,
            );
            if (!plan)
                throw new WorkspaceError(
                    "The prepared lesson is missing.",
                    409,
                );
            state.active = this.fresh(plan, 0, false);
            state.revision++;
            tx.put({ path: QUEUE_PATH, content: JSON.stringify(state) });
        });
        return this.view();
    }
    private fresh(
        plan: Lesson,
        replays: number,
        developerExposed: boolean,
    ): QuizSession {
        return {
            id: crypto.randomUUID(),
            version: 1,
            plan,
            startedAt: new Date().toISOString(),
            index: 0,
            evidence: plan.questions.map((q) => ({
                questionId: q.id,
                attempts: [],
                skipped: false,
                resolved: false,
            })),
            replays,
            developerExposed,
            busy: false,
        };
    }
    private check(s: QuizSession | null, id: string, version: number) {
        if (!s || s.id !== id || s.version !== version)
            throw new WorkspaceError(
                "This session changed. Refresh to use its current question.",
                409,
            );
        return s;
    }
    async answer(id: string, version: number, answer: string) {
        await this.ready;
        const controller = new AbortController();
        const session = await this.ws.mutate(async (tx) => {
            const state = await tx.get(QUEUE_PATH, emptyQueue());
            const s = this.check(state.active, id, version);
            if (s.busy || s.evidence[s.index].resolved)
                throw new WorkspaceError(
                    "This question is already being checked or is finished.",
                    409,
                );
            s.busy = true;
            this.controller = controller;
            tx.put({ path: QUEUE_PATH, content: JSON.stringify(state) });
            return s;
        });
        const started = Date.now();
        try {
            const assessment = await this.grade({
                plan: session.plan,
                index: session.index,
                answer,
                priorFeedback: session.evidence[session.index].attempts.map(
                    (a) => a.assessment.feedback,
                ),
                signal: controller.signal,
            });
            controller.signal.throwIfAborted();
            await this.ws.mutate(async (tx) => {
                const state = await tx.get(QUEUE_PATH, emptyQueue());
                const s = this.check(state.active, id, session.version);
                const evidence = s.evidence[s.index];
                evidence.attempts.push({
                    answer,
                    assessment,
                    latencyMs: Date.now() - started,
                    assisted:
                        evidence.attempts.length > 0 ||
                        s.replays > 0 ||
                        s.developerExposed,
                });
                evidence.resolved =
                    assessment.outcome !== "needs_adjustment" ||
                    evidence.attempts.length >= 3;
                s.busy = false;
                s.version++;
                tx.put({ path: QUEUE_PATH, content: JSON.stringify(state) });
            });
        } catch (error) {
            await this.ws.mutate(async (tx) => {
                const state = await tx.get(QUEUE_PATH, emptyQueue());
                if (
                    state.active?.id === id &&
                    state.active.version === session.version
                ) {
                    state.active.busy = false;
                    state.active.version++;
                    tx.put({
                        path: QUEUE_PATH,
                        content: JSON.stringify(state),
                    });
                }
            });
            if (!controller.signal.aborted)
                throw error instanceof WorkspaceError
                    ? error
                    : new WorkspaceError(modelError(error), 502);
        } finally {
            if (this.controller === controller) this.controller = null;
        }
        return this.view();
    }
    async act(
        action: "restart" | "skip" | "next" | "finish",
        id: string,
        version: number,
    ) {
        await this.ready;
        await this.ws.mutate(async (tx) => {
            const state = await tx.get(QUEUE_PATH, emptyQueue());
            const s = this.check(state.active, id, version);
            if (action === "restart") {
                this.controller?.abort();
                state.active = this.fresh(
                    s.plan,
                    s.replays + 1,
                    s.developerExposed,
                );
            } else if (action === "finish") {
                this.controller?.abort();
                const answered = s.evidence.filter(
                    (e) => e.attempts.length > 0,
                ).length;
                const skipped = s.evidence.filter((e) => e.skipped).length;
                const passed = s.evidence.filter((e) =>
                    e.attempts.some(
                        (a) => a.assessment.outcome !== "needs_adjustment",
                    ),
                ).length;
                const untouched = s.evidence.filter(
                    (e) => !e.attempts.length && !e.skipped,
                ).length;
                if (answered || skipped) {
                    const overview = `# ${s.plan.title}\n\n${s.plan.objective}\n\nAnswered: ${answered}. Passed (including retries): ${passed}. Skipped: ${skipped}. Unanswered: ${untouched}.\n\nPlan replays: ${s.replays}. Developer answers exposed: ${s.developerExposed ? "yes" : "no"}.\n\nThese are observations, not a mastery estimate. See evidence.json for the questions, actual answers, feedback, and assistance.\n`;
                    tx.put({
                        path: `plugins/vocabulary/sessions/${s.id}/evidence.json`,
                        content: JSON.stringify(
                            {
                                ...s,
                                busy: false,
                                endedAt: new Date().toISOString(),
                            },
                            null,
                            2,
                        ),
                        policy: "immutable",
                    });
                    tx.put({
                        path: `plugins/vocabulary/sessions/${s.id}/overview.md`,
                        content: overview,
                        policy: "immutable",
                    });
                    state.lastSaved = s.id;
                } else state.lastSaved = null;
                state.completed.push(s.plan.planId);
                state.active = null;
                const config = await tx.get(
                    "_system/queue-config.json",
                    DEFAULT_QUEUE_CONFIG,
                );
                if (state.ready.length <= config.lowWater) {
                    const previous = await tx.get<RefillJob | null>(
                        JOB_PATH,
                        null,
                    );
                    tx.put({
                        path: JOB_PATH,
                        content: JSON.stringify(requestRefill(previous, s.id)),
                    });
                }
            } else {
                if (s.busy)
                    throw new WorkspaceError(
                        "Wait for feedback, or restart/end this session.",
                        409,
                    );
                const current = s.evidence[s.index];
                if (action === "skip") {
                    current.skipped = true;
                    current.resolved = true;
                }
                if (!current.resolved)
                    throw new WorkspaceError(
                        "Answer or skip this question first.",
                        409,
                    );
                if (s.index < s.plan.questions.length - 1) s.index++;
                s.version++;
            }
            state.revision++;
            tx.put({ path: QUEUE_PATH, content: JSON.stringify(state) });
        });
        return this.view();
    }
    async expose() {
        await this.ready;
        await this.ws.mutate(async (tx) => {
            const state = await tx.get(QUEUE_PATH, emptyQueue());
            if (state.active && !state.active.developerExposed) {
                state.active.developerExposed = true;
                tx.put({ path: QUEUE_PATH, content: JSON.stringify(state) });
            }
        });
    }
}
export type QuizView = Awaited<ReturnType<QuizService["view"]>>;
