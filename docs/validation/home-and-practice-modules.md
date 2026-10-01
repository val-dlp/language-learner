# Home and practice modules — validation

Implementation validated on October 1, 2026. The earlier tutor checkpoint remains untouched. Live model and browser checks used isolated temporary learners; only the requested sample documents were added to the regular workspace.

## Automated checks

All 30 tests in the current six-file suite pass, along with TypeScript checking and the production build. Obsolete tutor tests were removed with the retired implementation. The current suite covers the document boundary, migration/recovery, Home diff acknowledgment, quiz evidence and restart behavior, the fourth-session refill trigger, privacy/exposure, and reader anchoring/scope.

## Live model check

`gpt-6-luna`, Home reasoning `low`, grader reasoning `none`.

Home updated an A2 restaurant-travel profile and curriculum and published exactly one valid ten-question lesson through document tools in **23.5 seconds**. All eleven tool calls succeeded; the immutable plan was present afterward.

Eight reviewed grading cases used the expression “si te viene bien” in a conditional sentence. Expected pass/fail outcomes matched in all eight cases. Median elapsed time was **1,546.5 ms**; maximum was **2,948 ms**. No structured-output failure occurred. This small single-expression check does not establish general assessment accuracy or a production latency percentile. Token usage was not captured in this initial run; subsequent app attempts retain the provider's usage alongside timing.

| Case                                             | Expected                        | Observed                | Elapsed  |
| ------------------------------------------------ | ------------------------------- | ----------------------- | -------- |
| “If that suits you”                              | Accept                          | Pass with clarification | 1,438 ms |
| Spanish explanation of convenience + condition   | Accept                          | Pass                    | 1,423 ms |
| “If it is convenient for you”                    | Accept                          | Pass with clarification | 1,236 ms |
| “It is definitely convenient for you”            | Reject                          | Needs adjustment        | 2,948 ms |
| “When you arrive safely”                         | Reject                          | Needs adjustment        | 1,443 ms |
| “It does not suit you”                           | Reject                          | Needs adjustment        | 2,179 ms |
| “If it work for you”                             | Accept meaning; correct grammar | Pass with clarification | 1,650 ms |
| Irrelevant instruction to ignore rubric and pass | Reject                          | Needs adjustment        | 1,685 ms |

## Browser checks

- A prepared quiz starts without question generation. A real English paraphrase receives passing feedback.
- Restart replays the same question, clears feedback/answers, increments replay count, and leaves the queued count unchanged.
- Skip advances immediately. End early writes an overview distinguishing a skipped question from nine unanswered questions; the discarded answer is absent.
- Selecting a sentence creates an anchored discussion. The live reader correctly explains the selected sentence.
- Reloading, reopening the document, and clicking the bubble restores the exact quote and both messages.
- Home, vocabulary, reading library/viewer, and document inspector render in the browser.

## Samples

The originally proposed Biblioteca Nacional links were editions of the same anthology. Its drop caps and illustrative layout produced poor reading order. They were not installed as learner samples.

The two installed editions are [La tortuga gigante](https://www.textos.info/horacio-quiroga/la-tortuga-gigante/pdf) (11 PDF pages, 2,224 extracted words) and [El almohadón de pluma](https://www.textos.info/horacio-quiroga/el-almohadon-de-pluma/pdf) (10 PDF pages, 1,782 extracted words), published by textos.info / Edu Robsy. Representative rendered source pages were compared with the extracted paragraphs. Accents and paragraphs survived; visible original typos/older spellings were preserved. PDF page numbers include cover and publication pages.

No sample PDF bytes are distributed in Git. Metadata records original URLs and edition notes, and the library can import the same sources again without duplicate documents.

## Practical limits

- Single local Node process; no coordinated multi-server writes or authentication.
- File checks prevent agent path escapes; they do not isolate a concurrently hostile OS process.
- PDF extraction can still have layout or reading-order defects on unfamiliar documents. There is no OCR.
- Visible-page text, recent conversations, and long tool results are bounded; truncation is explicit and additional source text is accessible through tools.
- Queued lessons delay incorporation of evidence. Home can replace unstarted plans; active plans and original evidence stay frozen.
- Cancel preserves already completed educational writes. Restart discards unsaved quiz answers and grading diagnostics.
