# Language Learner

## Overview

An open-source language learning app for serious practitioners.

This project's primary purpose is to help learners achieve fluency in the following core areas:
* Reading
* Listening
* Speaking

Standard content will be included when possible, but users are encouraged to 'bring their own' content when it serves them.

The application is AI-native, beginning with an API-based architecture for simplicity and eventually moving towards easier integration with local LLMs.

While learning a new language is never easy, I hope that this application helps you in your journey and becomes a precursor to new friendships, broadened careers, and beautiful adventures.

## Usage

This project is free to use and distribute under the AGPLv3 license. To make the program accessible and economically viable, there will be a paid cloud service.

## Vocabulary MVP — Wordfield

A local semantic-retrieval experiment: enter one or two English words, retrieve ten Spanish words, and type their English translations. Correct answers, skip, or three incorrect attempts advance to the next word. Refreshing clears the session. There are no accounts, result storage, or application analytics.

### Run locally

Use Node.js 24 LTS and npm. From this directory:

```sh
npm ci
npm run embed
npm run dev
```

Open http://localhost:3000. The first embedding run downloads the pinned MiniLM model into `.cache/models/`; subsequent runs reuse it. The generated vocabulary vectors are included, but the local model is still needed to embed each new query. No API key or database is required. Internet access is needed for the initial model download; inference runs on the local Node server.

### Experiment

Turn on **Developer view** to inspect all 150 ranked entries, the exact English text embedded, scores, and evaluation labels. The first ten entries are the quiz. Filtering the table does not change the ranking. Switching views preserves your current quiz.

Try `kitchen utensils`, `cooking utensils`, `musical instruments`, and `geometric shapes` for distinct groups; try `cold weather`, `outdoor adventure`, or `sports equipment` for overlaps. The dictionary has exactly ten entries in each control group and deliberately contains no kitchen appliances. Other groups overlap. Topic labels and Spanish text are never embedded or used to select results.

Every query returns the ten nearest entries, even when the dictionary does not cover the topic. `greetings` is a useful negative example. There is no relevance cutoff, generative fallback, randomization, or hidden category filtering. Cosine similarity is not confidence. Description wording and accepted synonyms can influence retrieval.

### Edit the dictionary

Edit `data/dictionary.json`, then run `npm run embed` and restart the app. Each record has a stable ID, Spanish word, accepted English answers, an English description, and evaluation-only topic labels. The index manifest catches changes to IDs, embedded text, model revision, or precision. Labels can change without re-embedding, but restart to reload them.

Answers ignore case and surrounding whitespace, but otherwise use exact matching. The hand-authored collection is a bounded practice set, not an exhaustive translation dictionary. See `data/README.md` for scope and regional choices.

### Modules

- `data/dictionary.json`: 150 hand-authored entries.
- `lib/embedding.ts`: pinned MiniLM, normalized mean pooling, 384 dimensions, fp32; shared by indexing and querying.
- `lib/index-store.ts`: vector-file loading and compatibility validation.
- `lib/rank.ts`: exact cosine ranking with deterministic ties.
- `app/api/vocabulary/route.ts`: topic validation and retrieval endpoint.
- `lib/quiz.ts`: pure quiz transitions; all user state lives in React memory.
- `app/page.tsx`: topic picker, quiz, and developer table.
- `components/ui/`: shadcn-style local Button and Input primitives using Radix Slot and Tailwind.

The stack is Next.js, React, TypeScript, Tailwind, and Transformers.js using the ONNX conversion of all-MiniLM-L6-v2. It is intended for local experimentation with a long-lived Node server, not an Edge runtime.

### Checks and retrieval report

```sh
npm test
npm run typecheck
npm run evaluate
npm run build
npm start
```

`evaluate` writes `data/evaluation.json`: full top-ten results for fixed prompts, control-group hit counts, and a repeated-query consistency check. It is observational; exploratory topics are not forced to match a category. Initial results: all seven control prompts recovered 10/10 intended entries. Overlapping topics mix categories; unsupported topics can return unrelated words.

The production build uses Webpack; this environment's Turbopack production build hit a process/port permission error. Development uses Next's default bundler. Keep the `data` directory alongside the application when running a production server.
