import fs from "node:fs/promises";
import path from "node:path";

import Papa from "papaparse";

import { appendDecisionLog, exists, getProjectPaths, readJsonFile, readPipelineState, readTextFile, writeJsonFile, writePipelineState, writeTextFile } from "@/lib/storage";
import { StageName } from "@/lib/types";
import { countWords, extractMarkdownSection } from "@/lib/utils";

export function falsifiable(hypothesis: string) {
  return /\b(associated|predict|difference|higher|lower|increase|decrease|effect|correlat|compare)\b/i.test(
    hypothesis
  );
}

export function timestamp() {
  return new Date().toISOString();
}

export async function setStageRunning(stage: StageName) {
  const state = await readPipelineState();
  await writePipelineState({
    ...state,
    status: "running",
    currentStage: stage,
    lastError: undefined
  });
}

export async function setAwaitingGate(stage: StageName, type: "select-question" | "approve-proposal" | "peer-review", payload: Record<string, unknown>) {
  const state = await readPipelineState();
  await writePipelineState({
    ...state,
    status: "awaiting_human_gate",
    currentStage: stage,
    humanGate: {
      type,
      pending: true,
      payload
    }
  });
}

export async function markStageComplete(stage: StageName, extra: Record<string, unknown> = {}) {
  const state = await readPipelineState();
  const completedStages = Array.from(new Set([...state.completedStages, stage])) as StageName[];
  await writePipelineState({
    ...state,
    ...extra,
    status: "idle",
    currentStage: stage,
    humanGate: undefined,
    completedStages
  });
}

export async function markPipelineComplete(stage: StageName) {
  const state = await readPipelineState();
  const completedStages = Array.from(new Set([...state.completedStages, stage])) as StageName[];
  await writePipelineState({
    ...state,
    status: "completed",
    currentStage: stage,
    humanGate: undefined,
    completedStages
  });
}

export async function markStageError(stage: StageName, error: unknown) {
  const state = await readPipelineState();
  await writePipelineState({
    ...state,
    status: "error",
    currentStage: stage,
    lastError: error instanceof Error ? error.message : String(error)
  });
}

export async function loadSelectedQuestion() {
  const paths = getProjectPaths();
  return readJsonFile<{ selectionType: "candidate" | "custom"; label: string; question: string }>(paths.selectedQuestion);
}

export async function readPaperMetadata() {
  const paths = getProjectPaths();
  return readJsonFile<Array<Record<string, string>>>(paths.paperMetadata);
}

export async function parseCsv(filePath: string) {
  const raw = await readTextFile(filePath);
  const parsed = Papa.parse<Record<string, string | number>>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true
  });
  return parsed.data;
}

export async function writeCsv(filePath: string, rows: Array<Record<string, string | number>>, overwrite = false) {
  const csv = Papa.unparse(rows);
  await writeTextFile(filePath, csv, overwrite);
}

export function allRequiredVariableNames(methodologyPlan: { hypotheses: Array<{ variables: Array<{ name: string }> }> }) {
  return Array.from(
    new Set(methodologyPlan.hypotheses.flatMap((hypothesis) => hypothesis.variables.map((variable) => variable.name)))
  );
}

export async function clearFigureDirectory() {
  const paths = getProjectPaths();
  if (!(await exists(paths.figuresDir))) {
    return;
  }
  const files = await fs.readdir(paths.figuresDir);
  await Promise.all(files.map((file) => fs.rm(path.join(paths.figuresDir, file), { force: true })));
}

export function thinSections(markdown: string, minWords = 800) {
  const headings = [
    "Abstract",
    "Introduction",
    "Literature Review",
    "Methodology",
    "Results",
    "Discussion",
    "Conclusion",
    "References"
  ];
  return headings
    .map((heading) => ({ heading, words: countWords(extractMarkdownSection(markdown, heading)) }))
    .filter((section) => section.words < minWords);
}

export async function collectResultJsonFiles() {
  const paths = getProjectPaths();
  const files = (await fs.readdir(paths.analysisDir))
    .filter((file) => file.startsWith("results_") && file.endsWith(".json"))
    .sort();
  return Promise.all(files.map((file) => readJsonFile<Record<string, unknown>>(path.join(paths.analysisDir, file))));
}

export async function ensureCommentsFile() {
  const paths = getProjectPaths();
  if (await exists(paths.commentsUpload)) {
    return paths.commentsUpload;
  }
  const csvPath = `${paths.dataDir}/peer_comments.csv`;
  if (await exists(csvPath)) {
    return csvPath;
  }
  throw new Error("No peer-review comments file found. Upload one before running peer-review.");
}

export async function writeWordCountReport(markdown: string, citationFlags: string[]) {
  const paths = getProjectPaths();
  const totalWords = countWords(markdown);
  const thin = thinSections(markdown);
  await writeTextFile(
    paths.paperWordCountReport,
    [
      "# Paper Word Count Report",
      "",
      `- Total words: ${totalWords}`,
      `- Citation flags: ${citationFlags.length}`,
      "",
      "## Thin Sections",
      ...(thin.length ? thin.map((section) => `- ${section.heading}: ${section.words} words`) : ["- None"])
    ].join("\n"),
    true
  );
  return { totalWords, thin };
}

export async function appendAutoDecision(stageLabel: string, lines: string[]) {
  await appendDecisionLog([`- Stage: ${stageLabel}`, ...lines].join("\n"));
}
