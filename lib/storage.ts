import fs from "node:fs/promises";
import path from "node:path";

import { PipelineState, ProjectPaths } from "@/lib/types";

export function getProjectPaths(): ProjectPaths {
  const root = process.cwd();
  const dataDir = path.join(root, "data");
  const outputsDir = path.join(root, "outputs");
  const analysisDir = path.join(outputsDir, "analysis");
  const figuresDir = path.join(outputsDir, "figures");
  const intermediateDir = path.join(outputsDir, "intermediate");
  const paperSectionsDir = path.join(outputsDir, "paper_sections");

  return {
    root,
    dataDir,
    rawPapersDir: path.join(dataDir, "raw_papers"),
    outputsDir,
    analysisDir,
    figuresDir,
    intermediateDir,
    paperSectionsDir,
    gapMap: path.join(outputsDir, "lit_review_gap_map.md"),
    candidateQuestions: path.join(intermediateDir, "candidate_questions.json"),
    paperMetadata: path.join(intermediateDir, "paper_metadata.json"),
    selectedQuestion: path.join(outputsDir, "selected_research_question.json"),
    proposal: path.join(outputsDir, "proposal.md"),
    proposalCritique: path.join(outputsDir, "proposal_reviewer_critique.md"),
    methodology: path.join(outputsDir, "methodology.md"),
    methodologyPlan: path.join(intermediateDir, "methodology_plan.json"),
    dataset: path.join(dataDir, "dataset.csv"),
    datasetProvenance: path.join(dataDir, "dataset_provenance.json"),
    dataQualityReport: path.join(analysisDir, "data_quality_report.md"),
    resultsDiscussion: path.join(outputsDir, "results_discussion.md"),
    adversarialReview: path.join(analysisDir, "adversarial_review.md"),
    numberTraceReport: path.join(analysisDir, "results_number_trace_warnings.md"),
    paperDraft: path.join(outputsDir, "paper_draft.md"),
    paperDocx: path.join(outputsDir, "paper_draft.docx"),
    peerReviewLog: path.join(outputsDir, "peer_review_log.md"),
    decisionLog: path.join(outputsDir, "decision_log.md"),
    pipelineState: path.join(intermediateDir, "pipeline_state.json"),
    paperWordCountReport: path.join(analysisDir, "paper_word_count_report.md"),
    commentsUpload: path.join(dataDir, "peer_comments.txt"),
    peerReviewResponses: path.join(intermediateDir, "peer_review_responses.json")
  };
}

export async function ensureProjectStructure(paths = getProjectPaths()) {
  await Promise.all([
    fs.mkdir(paths.rawPapersDir, { recursive: true }),
    fs.mkdir(paths.analysisDir, { recursive: true }),
    fs.mkdir(paths.figuresDir, { recursive: true }),
    fs.mkdir(paths.intermediateDir, { recursive: true }),
    fs.mkdir(paths.paperSectionsDir, { recursive: true })
  ]);
}

export async function exists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function writeTextFile(target: string, content: string, overwrite = false) {
  if ((await exists(target)) && !overwrite) {
    throw new Error(`${target} already exists. Re-run with overwrite=true to replace it safely.`);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${content.trimEnd()}\n`, "utf8");
}

export async function writeJsonFile(target: string, payload: unknown, overwrite = false) {
  await writeTextFile(target, JSON.stringify(payload, null, 2), overwrite);
}

export async function readTextFile(target: string) {
  return fs.readFile(target, "utf8");
}

export async function readJsonFile<T>(target: string): Promise<T> {
  const raw = await readTextFile(target);
  return JSON.parse(raw) as T;
}

export async function appendDecisionLog(summary: string, paths = getProjectPaths()) {
  await ensureProjectStructure(paths);
  const timestamp = new Date().toISOString();
  const header = "# Decision Log\n\n";
  if (!(await exists(paths.decisionLog))) {
    await fs.writeFile(paths.decisionLog, header, "utf8");
  }
  await fs.appendFile(paths.decisionLog, `## ${timestamp}\n${summary.trim()}\n\n`, "utf8");
}

export async function readPipelineState(paths = getProjectPaths()): Promise<PipelineState> {
  await ensureProjectStructure(paths);
  if (!(await exists(paths.pipelineState))) {
    const initial: PipelineState = {
      status: "idle",
      completedStages: [],
      lastUpdatedAt: new Date().toISOString()
    };
    await writeJsonFile(paths.pipelineState, initial, true);
    return initial;
  }
  return readJsonFile<PipelineState>(paths.pipelineState);
}

export async function writePipelineState(state: PipelineState, paths = getProjectPaths()) {
  const payload = {
    ...state,
    lastUpdatedAt: new Date().toISOString()
  };
  await writeJsonFile(paths.pipelineState, payload, true);
}

export async function listArtifacts(paths = getProjectPaths()) {
  const targets = [
    paths.gapMap,
    paths.proposal,
    paths.proposalCritique,
    paths.methodology,
    paths.dataQualityReport,
    path.join(paths.analysisDir, "summary_table.md"),
    paths.resultsDiscussion,
    paths.adversarialReview,
    paths.numberTraceReport,
    paths.paperDraft,
    paths.peerReviewLog,
    paths.paperWordCountReport,
    paths.decisionLog
  ];

  const artifacts = await Promise.all(
    targets.map(async (target) => {
      if (!(await exists(target))) {
        return null;
      }
      return {
        name: path.relative(paths.root, target),
        content: (await readTextFile(target)).slice(0, 12000)
      };
    })
  );

  const figures = (await exists(paths.figuresDir))
    ? (await fs.readdir(paths.figuresDir)).filter((file) => !file.startsWith("."))
    : [];

  return {
    markdownArtifacts: artifacts.filter(Boolean),
    figures
  };
}
