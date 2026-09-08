# Research Paper Accelerator

Research Paper Accelerator is a fullstack TypeScript web app for turning an early research idea into a structured academic paper workspace. It is built with Next.js, React, API routes, server-side pipeline modules, and local filesystem artifacts.

## What It Does

The app helps a researcher move through a reproducible paper-drafting pipeline:

1. Upload source research PDFs.
2. Extract and synthesize the literature into a gap map.
3. Generate candidate research questions and pause for human selection.
4. Draft a proposal with hypotheses and pause for human approval.
5. Design a methodology and generate or validate a dataset.
6. Run statistical analysis and create figure assets.
7. Draft Results and Discussion from the analysis outputs.
8. Assemble a paper draft as Markdown and DOCX.
9. Accept peer-review comments and require a human response for each one.

The important design choice is that the system does not silently jump from AI output to final paper. It writes intermediate artifacts first, tracks decisions, and pauses at human checkpoints.

## How It Works

The frontend is a small product-style app:

- `/` is the landing page.
- `/signup` and `/login` create a local browser profile for the demo flow.
- `/dashboard` is the working area for uploads, pipeline runs, gates, artifacts, and figures.

The backend is implemented with Next.js API routes:

- `POST /api/uploads/papers`
- `POST /api/uploads/comments`
- `GET /api/state`
- `POST /api/stages/[stage]/run`
- `POST /api/gates/select-question`
- `POST /api/gates/approve-proposal`
- `POST /api/gates/resolve-peer-comment`

Pipeline logic lives in `lib/pipeline`. State and artifacts are written to `data/` and `outputs/`, including the decision log, analysis JSON, generated figures, draft paper, and peer-review log.

## Stack

- Next.js 14
- React 18
- TypeScript
- `openai` as the default primary LLM provider
- `@anthropic-ai/sdk` as an optional alternate LLM provider
- `@google/genai` for optional dataset blueprint assistance
- `pdf-parse` for PDF text extraction
- `jstat` and `ml-matrix` for statistical analysis
- Native SVG generation for chart assets
- `docx` for Word document export

## Running Locally

Install dependencies:

```bash
npm install
```

Create `.env` from the example:

```bash
cp .env.example .env
```

For local testing without real API calls, set:

```env
MOCK_LLM=1
```

For real AI generation, set:

```env
MOCK_LLM=0
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-4.1-mini
```

To use Anthropic instead, set:

```env
MOCK_LLM=0
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_key_here
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification

Run the helper tests:

```bash
npm test
```

Run TypeScript checks:

```bash
npx tsc --noEmit
```
# ARPA
