import { z } from "zod";
export const LessonQuestionSchema = z.object({
    id: z.string().min(1).max(80),
    label: z
        .string()
        .max(100)
        .describe("Short topic label that does not reveal the answer"),
    prompt: z.string().min(1).max(2000),
    rubric: z.object({
        intendedSense: z.string().max(1500),
        essentialCriteria: z.array(z.string().max(500)).min(1).max(8),
        acceptedAlternatives: z.array(z.string().max(500)).max(12),
        exampleAnswer: z.string().max(1500),
    }),
});
export const LessonDraftSchema = z.object({
    title: z.string().min(1).max(150),
    objective: z.string().min(1).max(2000),
    constraints: z.string().max(2000),
    sourceDocuments: z
        .array(
            z.object({
                path: z.enum(["home/profile.md", "home/curriculum.md"]),
                revision: z.number().int().positive(),
            }),
        )
        .length(2),
    questions: z.array(LessonQuestionSchema).length(10),
});
export type LessonDraft = z.infer<typeof LessonDraftSchema>;
export type Lesson = LessonDraft & {
    planId: string;
    createdAt: string;
    sourceHashes: Record<string, string>;
};
export const GradeSchema = z.object({
    outcome: z.enum(["pass", "pass_with_clarification", "needs_adjustment"]),
    feedback: z.string(),
    understanding: z.string(),
    languageNotes: z.string(),
    constraintMet: z.boolean(),
    constraintFeedback: z.string(),
});
export type Grade = z.infer<typeof GradeSchema>;
export type Attempt = {
    answer: string;
    assessment: Grade;
    assisted: boolean;
    latencyMs: number;
    diagnostics?: unknown;
};
export type QuestionEvidence = {
    questionId: string;
    attempts: Attempt[];
    skipped: boolean;
    resolved: boolean;
};
export type QuizSession = {
    id: string;
    version: number;
    plan: Lesson;
    startedAt: string;
    index: number;
    evidence: QuestionEvidence[];
    replays: number;
    developerExposed: boolean;
    busy: boolean;
};
export type QueueState = {
    revision: number;
    ready: string[];
    active: QuizSession | null;
    completed: string[];
    superseded: string[];
    lastSaved: string | null;
};
export const emptyQueue = (): QueueState => ({
    revision: 0,
    ready: [],
    active: null,
    completed: [],
    superseded: [],
    lastSaved: null,
});
export const QUEUE_PATH = "_system/vocabulary.json";
export const QueueConfigSchema = z
    .object({
        target: z.number().int().min(2).max(20),
        lowWater: z.number().int().min(0).max(19),
    })
    .refine(
        (v) => v.target > v.lowWater,
        "Target must exceed the refill threshold",
    );
export const DEFAULT_QUEUE_CONFIG = { target: 5, lowWater: 1 };
