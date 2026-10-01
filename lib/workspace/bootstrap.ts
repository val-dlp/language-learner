import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Workspace } from "./store";
import { DEFAULT_LEARNER } from "../types";
export async function bootstrap(workspace: Workspace, repository: string) {
    await workspace.list(); // Establish and verify .local before reading the legacy fixed path.
    let legacy: {
        learnerDescription?: string;
        logs?: { id: string; endedAt: string; summary: unknown }[];
    } = {};
    try {
        const file = await open(
            path.join(repository, ".local/checkpoint.json"),
            constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.nlink !== 1)
                throw new Error("Invalid legacy checkpoint");
            legacy = JSON.parse(await file.readFile("utf8"));
        } finally {
            await file.close();
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
            throw new Error(
                "Could not safely migrate the existing checkpoint. It has been preserved.",
            );
    }
    await workspace.mutate(async (tx) => {
        if (await tx.get("_system/migration.json", false)) return;
        tx.put({
            path: "INDEX.md",
            content:
                "# Wordfield workspace\n\n- home/profile.md — learner facts, goals, and preferences\n- home/curriculum.md — current educational direction\n- home/observations/ — the Home agent’s working notes and evidence-linked logs\n- plugins/vocabulary/drafts/ — plans awaiting validation\n- plugins/vocabulary/plans/ — frozen prepared lessons\n- plugins/vocabulary/sessions/ — saved evidence\n- plugins/reading/documents/ — source text and anchored discussions\n\nUse list_documents to see the current inventory, revisions, and ownership. _system contains application-managed operational records.\n",
            policy: "immutable",
        });
        tx.put({
            path: "home/profile.md",
            content: `# Learner profile\n\n## Starting description\n${legacy.learnerDescription ?? DEFAULT_LEARNER}\n\n## Goals\nNot established yet. Ask what the learner wants to do in the language.\n\n## Skills and capabilities\nThe description above is self-reported; link observations to saved evidence.\n\n## Preferences and constraints\nClarify through conversation; do not infer personal facts.\n`,
        });
        tx.put({
            path: "home/curriculum.md",
            content:
                "# Learning direction\n\n## Current goals\nAwaiting the learner’s goals.\n\n## Next steps\nDiscuss what the learner wants to accomplish. Then prepare purposeful vocabulary practice.\n\n## Evidence and changes\nRecord material curriculum changes with references to the evidence that informed them.\n",
        });
        for (const log of legacy.logs ?? []) {
            const id = createHash("sha256")
                .update(log.id)
                .digest("hex")
                .slice(0, 24);
            tx.put({
                path: `plugins/vocabulary/legacy/${id}.md`,
                content: `# Legacy session summary\n\nOriginal ID: ${log.id}\n\nEnded: ${log.endedAt}\n\nLegacy summary; raw answers unavailable.\n\n\`\`\`json\n${JSON.stringify(log.summary, null, 2)}\n\`\`\`\n`,
                policy: "immutable",
            });
        }
        tx.put({
            path: "_system/migration.json",
            content: JSON.stringify({
                version: 1,
                at: new Date().toISOString(),
                logs: (legacy.logs ?? []).length,
            }),
        });
    }, "migration");
}
