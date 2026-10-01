import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getQuiz, getRefill } from "@/lib/runtime";
import { body, failure } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    try {
        const quiz = await getQuiz();
        after(async () => (await getRefill()).kick());
        return NextResponse.json(await quiz.view());
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    try {
        const input = z
            .discriminatedUnion("action", [
                z.object({ action: z.literal("start") }),
                z.object({
                    action: z.literal("answer"),
                    id: z.string(),
                    version: z.number().int(),
                    answer: z.string().trim().min(1).max(6000),
                }),
                z.object({
                    action: z.enum(["restart", "skip", "next", "finish"]),
                    id: z.string(),
                    version: z.number().int(),
                }),
            ])
            .parse(await body(request));
        const quiz = await getQuiz();
        const result =
            input.action === "start"
                ? await quiz.start()
                : input.action === "answer"
                  ? await quiz.answer(input.id, input.version, input.answer)
                  : await quiz.act(input.action, input.id, input.version);
        after(async () => (await getRefill()).kick());
        return NextResponse.json(result);
    } catch (error) {
        return failure(error);
    }
}
