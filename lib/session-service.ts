import type { CheckpointStore } from "./checkpoint";
import { composeSeed, type Tutor } from "./tutor";
import {
    MODEL,
    SESSION_LENGTH,
    type Checkpoint,
    type Command,
    type Session,
    type Snapshot,
} from "./types";

export class SessionError extends Error {
    constructor(
        message: string,
        public status = 409,
    ) {
        super(message);
    }
}

/** Single-user, single-process coordinator. Disk commits and session invalidation share a lock. */
export class SessionService {
    private checkpoint!: Checkpoint;
    private session: Session | null = null;
    private controller = new AbortController();
    private queue: Promise<unknown> = Promise.resolve();
    private ready: Promise<void>;
    constructor(
        private store: CheckpointStore,
        private tutor: Tutor,
        private configured: () => boolean,
    ) {
        this.ready = store.load().then((checkpoint) => {
            this.checkpoint = checkpoint;
        });
    }
    private async exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
        await this.ready;
        const pending = this.queue.then(fn);
        this.queue = pending.catch(() => {});
        return pending;
    }
    private snapshot(): Snapshot {
        return structuredClone({
            checkpoint: this.checkpoint,
            session: this.session,
            configured: this.configured(),
            model: MODEL,
        });
    }
    get() {
        return this.exclusive(() => this.snapshot());
    }
    private requireSession(command: Command) {
        const session = this.session;
        if (!session || session.id !== command.sessionId)
            throw new SessionError(
                "This session has changed. The latest session has been loaded.",
            );
        if (session.status !== "active")
            throw new SessionError("This session is already saved.");
        if (session.busy)
            throw new SessionError(
                "The tutor is still working. You can restart to discard this session.",
            );
        if (session.version !== command.version)
            throw new SessionError(
                "This answer or action is out of date. Please try again with the current question.",
            );
        return session;
    }
    async command(command: Command): Promise<Snapshot> {
        let work: (() => Promise<unknown>) | undefined;
        let commit: ((result: unknown) => void | Promise<void>) | undefined;
        let workingSession: Session | undefined;
        let startedAt = 0;
        await this.exclusive(async () => {
            if (command.action === "save_seed") {
                if (this.session?.status === "active")
                    throw new SessionError(
                        "Apply the description with Restart while a session is active.",
                    );
                if (!command.learnerDescription)
                    throw new SessionError("Enter a learner description.", 400);
                const next = {
                    ...this.checkpoint,
                    revision: this.checkpoint.revision + 1,
                    learnerDescription: command.learnerDescription,
                };
                await this.store.save(next);
                this.checkpoint = next;
                return;
            }
            if (!this.configured())
                throw new SessionError(
                    "Add OPENAI_API_KEY to .env.local and restart the development server to begin.",
                    503,
                );
            let session: Session;
            if (command.action === "start" || command.action === "restart") {
                if (
                    command.action === "start" &&
                    this.session?.status === "active"
                )
                    throw new SessionError(
                        "A session is already active. Use Restart to discard it.",
                    );
                if (
                    command.action === "restart" &&
                    this.session?.id !== command.sessionId
                )
                    throw new SessionError(
                        "This session has changed. Please restart the current session.",
                    );
                if (command.learnerDescription) {
                    const next = {
                        ...this.checkpoint,
                        revision: this.checkpoint.revision + 1,
                        learnerDescription: command.learnerDescription,
                    };
                    await this.store.save(next);
                    this.checkpoint = next;
                }
                this.controller.abort();
                this.controller = new AbortController();
                session = {
                    id: crypto.randomUUID(),
                    version: 0,
                    checkpoint: structuredClone(this.checkpoint),
                    seed: composeSeed(this.checkpoint),
                    evidence: [],
                    status: "active",
                    busy: false,
                    lastCallMs: null,
                    summary: null,
                };
                this.session = session;
            } else {
                session = this.requireSession(command);
            }
            const current = session.evidence.at(-1);
            const signal = this.controller.signal;
            if (command.action === "answer") {
                if (!current || current.resolved || !command.answer)
                    throw new SessionError(
                        "There is no question waiting for an answer.",
                        400,
                    );
                work = () =>
                    this.tutor.assess(
                        structuredClone(session),
                        structuredClone(current),
                        command.answer!,
                        signal,
                    );
                commit = (result) => {
                    const assessment = result as Awaited<
                        ReturnType<Tutor["assess"]>
                    >;
                    // Explicit language constraints can require another attempt without erasing correct meaning.
                    if (!assessment.constraintMet)
                        assessment.outcome = "needs_adjustment";
                    current.attempts.push({
                        answer: command.answer!,
                        assessment,
                        assisted: current.attempts.length > 0,
                    });
                    current.resolved =
                        assessment.outcome !== "needs_adjustment" ||
                        current.attempts.length >= 3;
                };
            } else if (command.action === "skip") {
                if (!current || current.resolved)
                    throw new SessionError(
                        "This question is already complete.",
                    );
                current.skipped = true;
                current.resolved = true;
                session.version++;
                return;
            } else if (command.action === "end") {
                const hasEvidence = session.evidence.some(
                    (item) => item.attempts.length || item.skipped,
                );
                if (!hasEvidence) {
                    session.status = "saved";
                    session.version++;
                    return; // No answer or skip: do not invent a learning record.
                }
                work = () =>
                    this.tutor.summarize(structuredClone(session), signal);
                commit = async (result) => {
                    const summary = result as Awaited<
                        ReturnType<Tutor["summarize"]>
                    >;
                    const next: Checkpoint = {
                        ...this.checkpoint,
                        revision: this.checkpoint.revision + 1,
                        logs: [
                            ...this.checkpoint.logs,
                            {
                                id: session.id,
                                endedAt: new Date().toISOString(),
                                questionsAnswered: session.evidence.filter(
                                    (item) => item.attempts.length,
                                ).length,
                                summary,
                            },
                        ],
                    };
                    await this.store.save(next);
                    this.checkpoint = next;
                    session.summary = summary;
                    session.status = "saved";
                };
            } else {
                if (current && !current.resolved)
                    throw new SessionError(
                        "Answer or skip the current question first.",
                    );
                if (session.evidence.length >= SESSION_LENGTH)
                    throw new SessionError(
                        "All ten questions are complete. Finish and save this session.",
                    );
                work = () =>
                    this.tutor.question(structuredClone(session), signal);
                commit = (result) => {
                    session.evidence.push({
                        question: {
                            ...(result as Awaited<
                                ReturnType<Tutor["question"]>
                            >),
                            id: crypto.randomUUID(),
                        },
                        attempts: [],
                        skipped: false,
                        resolved: false,
                    });
                };
            }
            session.busy = true;
            session.version++;
            workingSession = session;
            startedAt = Date.now();
        });
        if (work && workingSession && commit) {
            try {
                const result = await work();
                await this.exclusive(async () => {
                    if (this.session !== workingSession)
                        throw new SessionError(
                            "The discarded session's response was ignored.",
                        );
                    await commit!(result);
                    workingSession!.busy = false;
                    workingSession!.lastCallMs = Date.now() - startedAt;
                    workingSession!.version++;
                });
            } catch (error) {
                await this.exclusive(() => {
                    if (this.session === workingSession) {
                        workingSession!.busy = false;
                        workingSession!.version++;
                    }
                });
                if (this.session !== workingSession)
                    throw new SessionError(
                        "The discarded session's response was ignored.",
                    );
                if (error instanceof SessionError) throw error;
                // Do not expose provider payloads, credentials, or learner answers in errors/logs.
                const status = (error as { status?: number }).status;
                if (status === 401)
                    throw new SessionError(
                        "OpenAI rejected the API key. Check your local configuration.",
                        502,
                    );
                if (status === 429)
                    throw new SessionError(
                        "OpenAI is temporarily rate-limited or your API quota is exhausted. Retry shortly or check API billing.",
                        502,
                    );
                throw new SessionError(
                    "The tutor request or checkpoint save failed. Your saved checkpoint is unchanged; retry this step or restart.",
                    502,
                );
            }
        }
        return this.get();
    }
}
