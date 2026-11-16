import { runAssemblePaper } from "@/lib/pipeline/assemble-paper";
import { runDesignMethodology } from "@/lib/pipeline/design-methodology";
import { runDraftResults } from "@/lib/pipeline/draft-results";
import { runGenerateDataset } from "@/lib/pipeline/generate-dataset";
import { runGenerateProposal } from "@/lib/pipeline/generate-proposal";
import { runIngestLiterature } from "@/lib/pipeline/ingest-literature";
import { runMakeVisualizations } from "@/lib/pipeline/make-visualizations";
import { runPeerReview } from "@/lib/pipeline/peer-review";
import { runAnalysis } from "@/lib/pipeline/run-analysis";
import { StageName, StageRunOptions } from "@/lib/types";

export async function runStage(stage: StageName, options: StageRunOptions = {}) {
  switch (stage) {
    case "ingest-literature":
      return runIngestLiterature(Boolean(options.overwrite));
    case "generate-proposal":
      return runGenerateProposal(Boolean(options.overwrite));
    case "design-methodology":
      return runDesignMethodology(Boolean(options.overwrite));
    case "generate-dataset":
      return runGenerateDataset(options);
    case "run-analysis":
      return runAnalysis(Boolean(options.overwrite));
    case "make-visualizations":
      return runMakeVisualizations();
    case "draft-results":
      return runDraftResults(Boolean(options.overwrite));
    case "assemble-paper":
      return runAssemblePaper(options.style ?? "apa", Boolean(options.overwrite));
    case "peer-review":
      return runPeerReview();
    default:
      throw new Error(`Unsupported stage '${stage}'.`);
  }
}

const orderedStages: StageName[] = [
  "ingest-literature",
  "generate-proposal",
  "design-methodology",
  "generate-dataset",
  "run-analysis",
  "make-visualizations",
  "draft-results",
  "assemble-paper",
  "peer-review"
];

import { readPipelineState } from "@/lib/storage";

export async function runAllStages(options: StageRunOptions = {}) {
  const state = await readPipelineState();
  const completed = new Set(state.completedStages ?? []);
  const executed: Array<{ stage: StageName; result: unknown }> = [];

  // If already at an unresolved human gate, don't execute further
  if (state.status === "awaiting_human_gate" && state.humanGate?.pending) {
    return [{ stage: state.currentStage, result: { ok: true, status: "awaiting_human_gate" } }];
  }

  for (const stage of orderedStages) {
    if (completed.has(stage) && !options.overwrite) {
      continue;
    }

    // A stage that has not completed may still have partial or starter artifacts
    // on disk (for example, the bundled demo dataset). Replacing only that
    // stage's outputs lets "Run Until Next Gate" resume safely without rerunning
    // completed work.
    const result = await runStage(stage, { ...options, overwrite: true });
    executed.push({ stage, result });
    if ((result as { status?: string }).status === "awaiting_human_gate") {
      break;
    }
  }
  return executed;
}
