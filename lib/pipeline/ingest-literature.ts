import fs from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";

import { createLlmClient } from "@/lib/llm";
import { ensureProjectStructure, getProjectPaths, writeJsonFile, writeTextFile } from "@/lib/storage";
import { CandidateResearchQuestion } from "@/lib/types";
import { markdownTable } from "@/lib/utils";
import { appendAutoDecision, markStageError, setAwaitingGate, setStageRunning } from "@/lib/pipeline/helpers";

interface ExtractedPaper {
  filename: string;
  title: string;
  abstract: string;
  body: string;
}

const MAX_SYNTHESIS_SOURCE_CHARS = 14_000;
const MAX_ABSTRACT_CHARS = 1_200;

/**
 * Keep literature synthesis below provider context and rate limits while giving
 * every uploaded paper a representative excerpt. The full extracted metadata is
 * still written to disk separately for inspection.
 */
function preparePapersForSynthesis(papers: ExtractedPaper[]) {
  const perPaperBudget = Math.max(800, Math.floor(MAX_SYNTHESIS_SOURCE_CHARS / Math.max(papers.length, 1)));

  return papers.map((paper) => {
    const abstract = paper.abstract.slice(0, Math.min(MAX_ABSTRACT_CHARS, Math.floor(perPaperBudget / 3)));
    const bodyBudget = Math.max(400, perPaperBudget - abstract.length - 300);

    return {
      filename: paper.filename,
      title: paper.title,
      abstract,
      body: paper.body.slice(0, bodyBudget)
    };
  });
}

function extractAbstract(text: string) {
  const match = text.match(/abstract[:\s]+([\s\S]{0,1200}?)(?:\n\s*\n|introduction|1\.)/i);
  return match?.[1]?.trim() ?? "";
}

async function extractPaper(pdfPath: string): Promise<ExtractedPaper> {
  const buffer = await fs.readFile(pdfPath);
  let parsedText = "";
  try {
    const parsed = await pdfParse(buffer);
    parsedText = parsed.text ?? "";
  } catch {
    parsedText = "";
  }
  const lines = parsedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return {
    filename: path.basename(pdfPath),
    title: lines[0] ?? path.basename(pdfPath, ".pdf"),
    abstract: extractAbstract(parsedText),
    body: parsedText.slice(0, 18000)
  };
}

function buildGapMapMarkdown(
  synthesis: {
    themes: Array<{ theme: string; agreements: string[]; conflicts: string[]; gaps: string[] }>;
    papers: Array<{ filename: string; methodology: string; keyFinding: string; acknowledgedGaps: string[] }>;
    gapList: string[];
  },
  candidateQuestions: CandidateResearchQuestion[]
) {
  const themeRows = synthesis.themes.map((theme) => [
    theme.theme,
    theme.agreements.join("; "),
    theme.conflicts.join("; "),
    theme.gaps.join("; ")
  ]);

  const paperRows = synthesis.papers.map((paper) => [
    paper.filename,
    paper.methodology,
    paper.keyFinding,
    paper.acknowledgedGaps.join("; ") || "None noted"
  ]);

  return [
    "# Literature Review Gap Map",
    "",
    "## Themes",
    markdownTable(["Theme", "Agreements", "Conflicts", "Gaps"], themeRows),
    "",
    "## Per-Paper Methods and Findings",
    markdownTable(["Paper", "Methodology", "Key Finding", "Acknowledged Gaps"], paperRows),
    "",
    "## Gap List",
    ...synthesis.gapList.map((gap) => `- ${gap}`),
    "",
    "## Candidate Research Questions",
    "",
    ...candidateQuestions.flatMap((question) => [
      `### ${question.label}: ${question.question}`,
      `- Feasibility: ${question.feasibilityNote}`,
      `- Motivating papers: ${question.sourcePapers.join(", ")}`,
      ""
    ])
  ].join("\n");
}

export async function runIngestLiterature(overwrite = false) {
  const stage = "ingest-literature" as const;
  const paths = getProjectPaths();
  const llm = createLlmClient();
  await ensureProjectStructure(paths);
  await setStageRunning(stage);

  try {
    const files = (await fs.readdir(paths.rawPapersDir))
      .filter((file) => file.toLowerCase().endsWith(".pdf"))
      .slice(0, 15);
    if (!files.length) {
      throw new Error(`No PDF files found in ${paths.rawPapersDir}.`);
    }

    const papers = await Promise.all(files.map((file) => extractPaper(path.join(paths.rawPapersDir, file))));
    const papersForSynthesis = preparePapersForSynthesis(papers);
    const synthesis = await llm.generateJson<{
      themes: Array<{ theme: string; agreements: string[]; conflicts: string[]; gaps: string[] }>;
      papers: Array<{ filename: string; methodology: string; keyFinding: string; acknowledgedGaps: string[] }>;
      gapList: string[];
    }>(
      "literature_synthesis",
      [
        "You are synthesizing academic PDFs into structured JSON.",
        "Return valid JSON with keys themes, papers, gapList.",
        "themes: list of {theme, agreements, conflicts, gaps}.",
        "papers: list of {filename, methodology, keyFinding, acknowledgedGaps}.",
        "gapList: list of at least 3 concise research gaps.",
        "Ground every item in the provided papers and never invent filenames.",
        "",
        JSON.stringify(papersForSynthesis, null, 2)
      ].join("\n")
    );

    const candidatePayload = await llm.generateJson<{ candidateQuestions: CandidateResearchQuestion[] }>(
      "candidate_research_questions",
      [
        "Using the synthesis below, propose exactly 5 candidate research questions.",
        "Return valid JSON with key candidateQuestions.",
        "Each item must be {label, question, feasibilityNote, sourcePapers}.",
        "",
        JSON.stringify(synthesis, null, 2)
      ].join("\n")
    );

    if (candidatePayload.candidateQuestions.length !== 5) {
      throw new Error("Literature ingestion must produce exactly 5 candidate research questions.");
    }

    await writeTextFile(paths.gapMap, buildGapMapMarkdown(synthesis, candidatePayload.candidateQuestions), overwrite);
    await writeJsonFile(paths.paperMetadata, papers, overwrite);
    await writeJsonFile(paths.candidateQuestions, candidatePayload.candidateQuestions, overwrite);
    await appendAutoDecision("Milestone 1", [
      "- Auto-generated: literature synthesis, gap map, and candidate research questions.",
      "- Human checkpoint created: select one candidate question or provide a custom replacement."
    ]);
    await setAwaitingGate(stage, "select-question", { candidateQuestions: candidatePayload.candidateQuestions });
    return {
      ok: true,
      status: "awaiting_human_gate",
      candidateQuestions: candidatePayload.candidateQuestions
    };
  } catch (error) {
    await markStageError(stage, error);
    throw error;
  }
}
