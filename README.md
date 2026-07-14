# TraceNote

TraceNote is an evidence-first document research workspace. It summarizes and compares user-provided sources, answers questions across documents, and keeps every factual claim connected to an inspectable citation.

[Explore the privacy-safe public demo](https://tracenote-evidence-demo.wangjiacheng1231.chatgpt.site)

![TraceNote social preview](public/og.png)

## Why I built it

AI research tools are fast, but a polished answer is not useful when the supporting evidence is hard to verify. TraceNote explores a stricter product model:

- use only the sources selected by the user;
- surface the exact excerpt behind each citation;
- state when the available evidence is insufficient;
- support English and Chinese research without quietly adding web content.

## Product features

- PDF, DOCX, TXT, Markdown, CSV, and JSON ingestion
- persistent document storage with metadata
- single-document summaries and cross-document questions
- inline citation tags with an evidence inspector
- source-only mode with web search disabled by default
- English and Chinese interface switching
- automatic, English, or Chinese answer language
- responsive desktop and mobile layouts
- extractive fallback when no model key is configured

## Architecture

```text
Browser document parser
        ↓
R2 original file storage + D1 source text/metadata
        ↓
Relevant excerpt ranking
        ↓
OpenAI Responses API (optional)
        ↓
Answer with [S1] citation tags
        ↓
Evidence inspector showing the supporting excerpt
```

The application uses a server-side model key when available. Without one, the same evidence pipeline returns an extractive, citation-backed response so the core workflow remains testable.

## Tech stack

- Next.js, React, and TypeScript
- vinext and Cloudflare Workers
- Cloudflare D1 and R2
- Drizzle schema and migrations
- OpenAI Responses API
- PDF.js and Mammoth for browser-side document extraction

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

To verify a production build:

```bash
npm run build
```

`OPENAI_API_KEY` is optional. When it is absent, TraceNote uses its deterministic extractive fallback.

## Privacy and safety

- API keys are never exposed to the browser.
- The public portfolio demo uses fixed fictional content and accepts no uploads.
- The private workspace is deployed separately from the public demo.
- Uploaded file bytes and searchable metadata use separate storage bindings.
- Source-only prompts explicitly prohibit outside knowledge and invented citations.

## Repository structure

```text
app/                 Product interface and API routes
db/                  D1 schema
drizzle/             Database migrations
lib/storage.ts       D1/R2 storage boundary
public/              Brand and social-preview assets
worker/              Cloudflare Worker entry point
```

## Status

The bilingual MVP and public portfolio demo are deployed. Planned work includes stronger semantic retrieval, evaluation datasets, per-user project organization, and automated citation-quality checks.

## Author

Designed and engineered by David Wang in Toronto, Canada.
