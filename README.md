# Wordfield

A local language-learning workspace: Home maintains your profile and curriculum, vocabulary runs prepared lessons with quick feedback, and Reading keeps discussions beside source passages. Built with Next.js, React, shadcn-style controls, OpenAI Agents SDK, Responses API, and PDF.js.

## Run locally

Use Node.js 22+ and an OpenAI API key with access to the configured models.

```sh
npm install
# Create .env.local if needed; do not overwrite an existing file.
# Add OPENAI_API_KEY=...
npm run dev
```

Open http://localhost:3000. `.env.example` lists optional model settings. All three roles default to `gpt-6-luna`: Home and Reading use low reasoning; the grader uses none. Restart the server after changing settings. Model requests use your API account; there is no simulated tutor in the app.

## Home and learning documents

Tell Home your goals, level, and preferences. It can update a free-form curriculum, maintain a brief learner profile, organize observations, review practice evidence, and prepare lessons. Profile and curriculum are visible on Home; their edit links open the document inspector with revision checks.

Home runs when you send a message, or when saved vocabulary practice produces a low-queue event. There is no heartbeat. Its `diff` tool reports educational changes since the last successfully completed Home run; failed/cancelled runs do not acknowledge that cursor. Completed document writes remain saved even if a later step fails.

The agent has bounded document tools, no shell, and no access to source code or `.env.local`. Document reads, writes, searches, and directory creation use `.local/workspace`, a confined subtree of this repository. Absolute paths, traversal, symlinks, and hard-linked files are rejected. This is an application boundary, not an OS sandbox against a hostile local process replacing directories concurrently.

## Vocabulary

Home publishes ten-question lesson plans with fixed objectives, constraints, and private rubrics. Starting practice claims one ready plan. An empty queue asks you to return to Home; the quiz does not generate its own questions.

- Answer in your own words. One small Responses API call evaluates the current answer. Outcomes are **understood**, **understood with clarification**, or **needs adjustment**.
- A pass or three attempts enables Next; Skip advances immediately. Next, Skip, Restart, and Finish do not call a model.
- **Restart** discards current answers and feedback and replays the same prepared plan. It consumes no additional plan and writes no performance summary. A replay count preserves the fact that you have seen the questions before.
- **Finish / End early** saves immutable actual answers, attempts, feedback, skips, rubric/objective snapshots, assistance, developer exposure, timings, and a factual overview. Unanswered questions are not failures. An untouched session closes without performance evidence.
- Provider failures do not consume attempts. Restart/end cancels pending grading; late responses cannot alter the replacement session. Unsaved practice survives a server restart; interrupted grading can be retried.

After a session closes, a durable event requests Home to replenish the queue if **one or fewer unstarted lessons** remain. The starting target is **five ready lessons in total**. Both values are editable under Developer view → Queue settings. The worker reviews completed evidence and fills available slots without blocking practice. Home may supersede/reorder unstarted plans, with a recorded reason; active plans remain frozen.

Refills and manual Home turns share one run coordinator. Repeated completion events coalesce, startup resumes interrupted work, and failed/cancelled refills retain successfully published plans. Retry is explicit; navigation does not invent new refill events. A cancelled event does not restart itself.

## Reading

Upload PDF, UTF-8 text, or Markdown (up to 25 MB / 200 pages / 2 million extracted characters). PDFs need selectable text; OCR is not included. PDF.js extracts page text into frozen blocks with stable IDs. The viewer reflows that text, preserving source page numbers; it does not reproduce the original layout. Markdown is displayed as source text.

Highlight a passage and choose **Discuss selection**, or use **+** beside a paragraph. The assistant sees the selected passage, neighboring text, and the actual pages visible when you press Send. It can read more pages, search the source, and consult Home documents. It cannot edit the curriculum or read vocabulary's private plugin files.

Discussion bubbles and the saved-discussions menu reopen conversations after a reload. Anchors use document version, page/block IDs, character ranges, and exact quotes, not screen coordinates. Each message retains its original context snapshot. **Finish reading & save activity** creates a factual activity record; viewing a page or receiving an explanation is not recorded as mastery. Reading does not trigger Home automatically.

**Add sample stories** imports _La tortuga gigante_ and _El almohadón de pluma_, by Horacio Quiroga, from [textos.info](https://www.textos.info/horacio-quiroga). Imports retain author, source URL, and edition information. Downloads live only in the local workspace; PDF bytes are not committed to the repository. Sample editions contain some original typos/older spelling, which extraction preserves.

## Developer view

The inspector lists workspace documents and revisions, including plans, saved evidence, reading conversations, and application traces. Home's current/last run exposes its exact instructions and input, tool calls/results/timings, model/effort, usage, and provider-supplied reasoning summaries when available. It never exposes private chain-of-thought.

Saved grading attempts include the exact bounded grading request, configuration, token usage, and latency. Reader traces include Send-time context and tool results. Inspecting private vocabulary documents or a full Home trace marks ready/active lessons as developer-exposed. Discarding a quiz removes its answers and grading diagnostics, rather than retaining them in an operational revision history.

## Storage, migration, and recovery

```text
.local/workspace/
  INDEX.md
  home/profile.md
  home/curriculum.md
  home/observations/<category>/...
  home/conversations/main/<message-id>.json
  plugins/vocabulary/drafts/<name>.json
  plugins/vocabulary/plans/<plan-id>.json
  plugins/vocabulary/sessions/<session-id>/{evidence.json,overview.md}
  plugins/vocabulary/legacy/<id>.md
  plugins/reading/documents/<id>/
    source.pdf (or .txt / .md)
    metadata.json
    pages/<page-id>.json
    threads/<thread-id>/{anchor.json,messages/...}
  plugins/reading/sessions/<id>.json
  _system/manifest.json
  _system/revisions/<document-id>/<revision>.json
  _system/vocabulary.json
  _system/queue-config.json
  _system/refill.json
  _system/home-state.json
  _system/{runs,reader-runs}/...
```

All workspace content is gitignored. The document store serializes mutations, checks expected revisions, and uses a write-ahead journal for recoverable changes to files, versions, and indexes. On restart it finishes pending commits. Manual edits to tracked mutable educational files become externally authored revisions; modified/missing immutable evidence stops processing rather than silently replacing history. Create new documents through the tools so they enter the inventory. Directory renaming and arbitrary external file imports are not synchronized automatically.

The first startup imports the previous `.local/checkpoint.json` exactly once. It preserves its learner description and old summaries, clearly labeling that those summaries lack raw answers. **The original checkpoint is left intact.** The old `/api/tutor` endpoint returns a reload notice and cannot write it. The previous in-memory quiz is not imported.

For backup, stop the server and copy the entire `.local` directory. Restore the complete workspace together, including `_system`; do not mix evidence files and metadata from different backups. To return to the pre-refactor app, stop the server and use commit `ece40ba` in a separate checkout with the preserved original checkpoint. New workspace evidence is not convertible into the old summary-only format automatically.

This experiment supports **one learner and one Node server process per workspace**. Tabs share the same learner. There is no authentication, multi-process locking, or background process while the server is stopped; use it locally. SDK hosted tracing and Responses storage are disabled, but model inputs still go to OpenAI. Documents and logs currently accumulate without long-term compaction.

## Code map and extension points

- `lib/workspace/`: confined I/O, document policies, revisions/journal, migration.
- `lib/home/`: document tools, streamed agent runs, durable refill worker.
- `lib/models/`: shared Agents SDK runner and independent role configuration.
- `lib/plugins/registry.ts`: module descriptions exposed in Home/navigation context.
- `lib/plugins/vocabulary/`: lesson schema/publication, quiz state machine, Responses grader.
- `lib/plugins/reading/`: extraction, canonical text, anchors, scoped document assistant.
- `app/api/`: validated local API boundaries; `components/developer/`: inspection.

A new module gets a namespace, registry entry, UI, and service. Add its document permissions in the store; register any typed publication contract with Home's tools. Completed evidence is written through the store and becomes discoverable through diff without adding an agent-to-agent messaging layer. Reading demonstrates a module with source inputs instead of queued lesson plans.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

Tests use injected models and temporary workspaces; no key is required. They cover filesystem boundaries, conflicts/immutability, journal recovery, migration, failed-run diff replay, cancellation, queued plans, attempts/restarts, saved evidence/refills, private grading context, and reader anchors/context/scope.

The optional `scripts/smoke-models.ts` uses the real API in a temporary workspace, then removes it. Run with `node --env-file=.env.local --import tsx scripts/smoke-models.ts`. It incurs API usage. `scripts/preview-smoke.ts` serves an isolated browser-test learner on port 3001 after a production build; it also uses real models and never changes the normal workspace. Stop it with Ctrl+C.

See [implementation plan](docs/plans/home-and-practice-modules.md) and [validation notes](docs/validation/home-and-practice-modules.md).
