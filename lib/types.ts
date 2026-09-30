import { z } from "zod";

export const MODEL = "gpt-6-luna";
export const SESSION_LENGTH = 10;
export const DEFAULT_LEARNER =
    "I am an English speaker learning Spanish at roughly A1–A2 level. I know common greetings, everyday objects, and some present-tense verbs. Help me build useful everyday vocabulary and notice gaps in my understanding. I may answer in English or Spanish, with a translation or an explanation. Keep feedback concise and supportive.";

export const QuestionSchema = z.object({
    prompt: z.string(),
    focus: z.string(),
    rubric: z.object({
        intendedSense: z.string(),
        essentialCriteria: z.array(z.string()),
        acceptedAlternatives: z.array(z.string()),
        exampleAnswer: z.string(),
    }),
});
export const AssessmentSchema = z.object({
    outcome: z.enum(["pass", "pass_with_clarification", "needs_adjustment"]),
    feedback: z.string(),
    understanding: z.string(),
    languageNotes: z.string(),
    constraintMet: z.boolean(),
    constraintFeedback: z.string(),
});
export const SummarySchema = z.object({
    overview: z.string(),
    covered: z.array(z.string()),
    demonstrated: z.array(z.string()),
    needsPractice: z.array(z.string()),
    nextFocus: z.string(),
});
export type Question = z.infer<typeof QuestionSchema> & { id: string };
export type Assessment = z.infer<typeof AssessmentSchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type Attempt = {
    answer: string;
    assessment: Assessment;
    assisted: boolean;
};
export type Evidence = {
    question: Question;
    attempts: Attempt[];
    skipped: boolean;
    resolved: boolean;
};
export type SessionLog = {
    id: string;
    endedAt: string;
    questionsAnswered: number;
    summary: Summary;
};
export type Checkpoint = {
    revision: number;
    learnerDescription: string;
    logs: SessionLog[];
};
export type Session = {
    id: string;
    version: number;
    checkpoint: Checkpoint;
    seed: string;
    evidence: Evidence[];
    status: "active" | "saved";
    busy: boolean;
    lastCallMs: number | null;
    summary: Summary | null;
};
export type Snapshot = {
    checkpoint: Checkpoint;
    session: Session | null;
    configured: boolean;
    model: string;
};
export const CommandSchema = z.object({
    action: z.enum([
        "start",
        "restart",
        "save_seed",
        "answer",
        "skip",
        "next",
        "end",
    ]),
    sessionId: z.string().optional(),
    version: z.number().int().optional(),
    answer: z.string().trim().min(1).max(6000).optional(),
    learnerDescription: z.string().trim().min(1).max(6000).optional(),
});
export type Command = z.infer<typeof CommandSchema>;
