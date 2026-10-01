export type ModelRole = "home" | "grader" | "reader";
export function modelConfig(role: ModelRole) {
    const prefix = role.toUpperCase();
    const configured = process.env[`${prefix}_REASONING_EFFORT`];
    const effort = ["none", "low", "medium", "high"].includes(configured ?? "")
        ? (configured as "none" | "low" | "medium" | "high")
        : role === "grader"
          ? "none"
          : "low";
    return { model: process.env[`${prefix}_MODEL`] || "gpt-6-luna", effort };
}
export function modelError(error: unknown) {
    if ((error as { status?: number })?.status === 401)
        return "OpenAI rejected the configured API key.";
    if ((error as { status?: number })?.status === 429)
        return "OpenAI quota or rate limit reached. Check billing or retry shortly.";
    return "The model request did not finish. Saved work is preserved; retry or cancel.";
}
