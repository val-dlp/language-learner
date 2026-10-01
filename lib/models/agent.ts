import { Agent, Runner, type Tool } from "@openai/agents";
import { modelConfig } from "./config";
export type AgentInput = {
    role: "home" | "reader";
    instructions: string;
    input: string;
    tools: Extract<Tool, { type: "function" }>[];
    signal: AbortSignal;
    onText: (text: string) => void;
    onReasoning: (summary: unknown) => void;
};
export type AgentEngine = (
    input: AgentInput,
) => Promise<{ text: string; usage: unknown }>;
export const runAgent: AgentEngine = async (options) => {
    const config = modelConfig(options.role);
    const agent = new Agent({
        name: options.role === "home" ? "Wordfield Home" : "Wordfield Reader",
        model: config.model,
        instructions: options.instructions,
        tools: options.tools,
        modelSettings: {
            reasoning: {
                effort: config.effort,
                summary: config.effort === "none" ? undefined : "auto",
            },
            store: false,
        },
    });
    const runner = new Runner({ tracingDisabled: true });
    const result = await runner.run(agent, options.input, {
        stream: true,
        maxTurns: 30,
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(240_000)]),
    });
    for await (const event of result) {
        if (
            event.type === "raw_model_stream_event" &&
            event.data.type === "output_text_delta"
        )
            options.onText(event.data.delta);
        if (
            event.type === "run_item_stream_event" &&
            event.name === "reasoning_item_created"
        ) {
            const raw = event.item.rawItem as { summary?: unknown };
            if (raw.summary) options.onReasoning(raw.summary);
        }
    }
    await result.completed;
    return {
        text: String(result.finalOutput ?? ""),
        usage: result.rawResponses.map((r) => r.usage),
    };
};
