# Wordfield — Vocabulary Lab

A small adaptive vocabulary tutor built with Next.js, React, shadcn-style components, and the OpenAI Agents SDK. The tutor uses `gpt-6-luna` to generate questions, assess free-form answers, and write evidence-based session logs. English → Spanish is the default; the visible learner description can change the focus and preferences.

## Run locally

Requires Node.js 22+ and an OpenAI API key with access to `gpt-6-luna`.

```sh
npm install
cp .env.example .env.local
# Set OPENAI_API_KEY in .env.local. Never commit this file.
npm run dev
```

If `.env.local` already exists, edit it rather than copying over it. Open http://localhost:3000. Restart the development server after changing environment variables. Model requests use your OpenAI API account and incur usage charges. No simulated tutor is exposed in the application.

## A session

1. Review the visible **learner description / seed prompt**: level, interests, language pair, and constraints such as “I can only respond in Spanish.” Save edits, or start a session to save and use them immediately.
2. The tutor receives that description plus all previously saved session logs. It creates one question and a private assessment rubric before seeing an answer.
3. Answer with a translation, explanation, or example. The tutor returns **pass**, **pass with clarification**, or **needs adjustment**, with concise feedback. Meaning, language notes, and response-constraint compliance are recorded separately.
4. A pass, skip, or three attempts completes the question. There are at most ten questions. Click **Finish & save session** after question ten, or **End & save session** at any earlier point, to write the evidence-based log.
5. **Restart** discards the current session without summarizing it and starts again from the latest saved learner description and logs. **Apply & restart session** first saves the edited description, then discards the session and starts with the new description. Neither operation adds a session log.

An unanswered session ended before any answer or skip creates no log. Failed model calls can be retried without losing the saved checkpoint. Reloading the page reconnects to an active session in the same server process. Closing the tab does not save a session; restarting the server discards all unsaved session state.

## Developer view

The developer view exposes the exact composed seed, the current question's fixed rubric, attempts and structured verdicts, all current session evidence, the saved checkpoint, model name, and last request duration. It shows expected answers, so evidence collected while using this view should not be treated as an unaided learning assessment. It does not display private model reasoning.

## Architecture

- `app/page.tsx`: session interface, editable seed, saved logs, and developer view.
- `app/api/tutor/route.ts`: validated same-origin API; credentials remain server-side.
- `lib/tutor.ts`: Agents SDK agent with task-specific structured output for question generation, assessment, and summary. The app supplies explicit context for each run; no hosted conversation or SDK session memory survives Restart.
- `lib/session-service.ts`: server-owned state machine, retries, ten-question cap, cancellation, stale-request rejection, and checkpoint commits. Restart invalidates in-flight model work; discarded results cannot mutate the new session or save logs. Short state transitions and atomic file commits share a lock.
- `lib/checkpoint.ts`: validated JSON storage at `.local/checkpoint.json`, using atomic replacement. The file contains the learner description and concise saved logs, never the full active transcript.
- `lib/types.ts`: shared types and structured output schemas.
- `tests/`: automated tests with injected simulated tutor responses; no API key required.

The session log records what was covered, evidence of understanding, material gaps, and a suggested next focus. Hints and retries are marked as assisted. Prompts discourage mastery claims based on a single success and distinguish presented material from observed understanding. This is still model-generated assessment, not a calibrated proficiency measurement.

This MVP is deliberately **single user, one Node server process**. The checkpoint is shared by tabs on that server. It has no accounts, authentication, multi-process coordination, or production database; use it locally, not as a public multi-user deployment. Saved logs accumulate without compaction for now. The entire saved context is sent on each tutor request. SDK tracing is disabled and Responses storage is disabled (`store: false`); requests still go to OpenAI and are subject to the account's data policies.

The previous embedding search, curated dictionary, vector index, and embedding scripts have been removed from the active implementation. Git history retains that experiment. Candidate-retrieval tools can be added later if useful.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover fixed rubrics, checkpoint recovery, retries, constraints, stale submissions, the ten-question boundary, failed saves, seed changes, and restarting during assessments or summary generation. The build uses webpack for compatibility with this local environment.
