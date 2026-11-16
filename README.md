# ARPA — Research Paper Accelerator

ARPA is a full-stack TypeScript application that turns an early research idea and source papers into a traceable academic-paper workspace. It combines literature synthesis, human approval checkpoints, dataset generation or validation, statistical analysis, manuscript drafting, and peer-review response management in one guided workflow.

It is designed to support researchers, not replace their judgment: every major AI-generated decision is saved as an artifact and the workflow pauses at researcher-controlled gates before it can continue.

## Core workflow

1. Upload source research PDFs.
2. Extract literature themes and generate a gap map.
3. Choose or write a research question at a human checkpoint.
4. Generate a proposal and approve or return it for revision.
5. Design the methodology and create or validate a dataset.
6. Run statistical analysis and generate SVG figures.
7. Draft Results and Discussion from the analysis outputs.
8. Assemble Markdown and DOCX paper drafts.
9. Upload peer-review comments and record a human response and revision decision for each one.

The **Run Until Next Gate** action continues only unfinished work. It does not overwrite previously completed stages; individual stage controls are available when a deliberate rerun is needed.

## Architecture

- **Frontend:** Next.js 14 App Router, React 18, TypeScript, and a compact dashboard UI.
- **API layer:** Next.js route handlers for uploads, pipeline execution, human-gate decisions, state, figures, exports, and reset.
- **Pipeline:** Server-side modules in `lib/pipeline/`, one module per research stage.
- **Persistence:** Local project files under `data/` and `outputs/`. This makes intermediate work inspectable and easy to audit during a demo.
- **AI providers:** OpenAI by default, with optional Anthropic support. Mock mode supports an offline, predictable demo workflow.
- **Analysis and exports:** `jstat`, `ml-matrix`, CSV processing, native SVG figure generation, and DOCX export.

## Run it locally

### Prerequisites

- Node.js 18.17 or newer
- npm 9 or newer

### 1. Install dependencies

```bash
git clone https://github.com/Arnav7x/ARPA.git
cd ARPA
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env
```

For a no-key local demo, set this in `.env`:

```env
MOCK_LLM=1
```

For OpenAI-backed generation:

```env
MOCK_LLM=0
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

For Anthropic-backed generation:

```env
MOCK_LLM=0
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
```

### 3. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a local workspace profile or use the one-click demo login, then open the dashboard.

For a production-style local run:

```bash
npm run build
npm start
```

### 4. Demo the workflow

1. Upload one or more PDF papers in **Workspace Inputs**.
2. Click **Run Until Next Gate**.
3. Select a research question, then approve the proposal at the next checkpoint.
4. Continue the pipeline to produce the dataset, analysis outputs, figures, and paper draft.
5. Upload `.txt`, `.csv`, or `.rtf` review comments and record decisions in the peer-review gate.
6. Download the DOCX, Markdown, dataset, Tableau CSV, and audit logs from **Exports**.

## Verification

```bash
npm test
npx tsc --noEmit
npm run build
```

## Evaluation summary

ARPA addresses a common research-workflow problem: drafting tools often produce a final-looking answer without making its sources, assumptions, statistical outputs, or human decisions easy to inspect. ARPA structures that process into explicit stages and retains the artifacts from each stage.

In an evaluation, emphasize these points:

- **Traceability:** the literature gap map, chosen question, methodology, analysis results, figures, paper draft, decision log, and peer-review responses are persisted as separate artifacts.
- **Human control:** research-question selection, proposal approval, and every peer-review response are explicit gates rather than silent automated transitions.
- **Reproducibility:** the methodology specifies variables and tests; analysis produces structured outputs and figures; dataset provenance is recorded.
- **Practical delivery:** the dashboard gives a researcher one place to upload sources, inspect artifacts, review figures, and export a DOCX or Markdown manuscript.
- **Responsible limitations:** this is a local-file, single-workspace prototype with browser-local demo profiles, not a multi-user production research system. AI-generated text, references, and statistical interpretation still require researcher verification; citation flags and audit artifacts are intentionally surfaced rather than hidden.

## Project layout

```text
app/             Pages and API routes
components/      Landing, authentication, dashboard, and visual components
lib/pipeline/    Research pipeline stages
lib/             Configuration, storage, LLM, types, and utilities
data/            Uploaded source material and datasets
outputs/         Generated artifacts, analysis, figures, drafts, and logs
tests/           Unit tests for provider configuration and helpers
```
