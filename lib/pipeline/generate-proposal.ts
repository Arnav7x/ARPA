import { createLlmClient } from "@/lib/llm";
import { getProjectPaths, readTextFile, writeTextFile } from "@/lib/storage";
import { appendAutoDecision, falsifiable, loadSelectedQuestion, markStageError, setAwaitingGate, setStageRunning } from "@/lib/pipeline/helpers";

interface ProposalPayload {
  problemStatement: string;
  hypotheses: string[];
  researchQuestions: string[];
  expectedContributions: { theoretical: string; practical: string };
}

function isValidProposal(payload: unknown): payload is ProposalPayload {
  if (!payload || typeof payload !== "object") return false;
  const proposal = payload as Partial<ProposalPayload>;
  return (
    typeof proposal.problemStatement === "string" &&
    Array.isArray(proposal.hypotheses) &&
    proposal.hypotheses.length === 3 &&
    proposal.hypotheses.every((hypothesis) => typeof hypothesis === "string" && falsifiable(hypothesis)) &&
    Array.isArray(proposal.researchQuestions) &&
    proposal.researchQuestions.length >= 2 &&
    proposal.researchQuestions.length <= 3 &&
    typeof proposal.expectedContributions?.theoretical === "string" &&
    typeof proposal.expectedContributions.practical === "string"
  );
}

function proposalMarkdown(payload: ProposalPayload) {
  return [
    "# Research Proposal",
    "",
    "## Problem Statement",
    payload.problemStatement,
    "",
    "## Hypotheses",
    "",
    ...payload.hypotheses.map((hypothesis, index) => `${index + 1}. ${hypothesis}`),
    "",
    "## Research Questions",
    "",
    ...payload.researchQuestions.map((question) => `- ${question}`),
    "",
    "## Expected Contributions",
    "",
    `- Theoretical: ${payload.expectedContributions.theoretical}`,
    `- Practical: ${payload.expectedContributions.practical}`
  ].join("\n");
}

export async function runGenerateProposal(overwrite = false) {
  const stage = "generate-proposal" as const;
  const llm = createLlmClient();
  const paths = getProjectPaths();
  await setStageRunning(stage);

  try {
    const selected = await loadSelectedQuestion();
    const gapMap = await readTextFile(paths.gapMap);

    const basePrompt = [
      "Generate a research proposal as valid JSON with keys problemStatement, hypotheses, researchQuestions, expectedContributions.",
      "Constraints:",
      "- hypotheses must be exactly 3 items.",
      "- each hypothesis must be phrased as a falsifiable, testable claim.",
      "- researchQuestions must be 2 or 3 items.",
      "- expectedContributions must contain theoretical and practical.",
      "",
      `SELECTED QUESTION:\n${selected.question}`,
      "",
      `GAP MAP:\n${gapMap}`
    ].join("\n");

    let proposal = await llm.generateJson<ProposalPayload>("proposal", basePrompt);

    if (!isValidProposal(proposal)) {
      proposal = await llm.generateJson<ProposalPayload>(
        "proposal_retry",
        [
          basePrompt,
          "",
          "Rewrite the complete proposal. Each hypothesis must name an intervention or predictor and a measurable outcome.",
          "Use this pattern: 'Participants exposed to [X] will show significantly higher/lower [measured Y] than [comparison group].'",
          "Use words such as associated, predicts, improves, reduces, increases, decreases, affects, or significantly higher/lower."
        ].join("\n")
      );
    }

    if (!isValidProposal(proposal)) {
      throw new Error("Proposal generation did not return three measurable, falsifiable hypotheses. Try a more specific research question.");
    }

    const critique = await llm.generateText(
      "proposal_critique",
      [
        "Act as a skeptical peer reviewer.",
        "Identify the weakest hypothesis and the first attack a reviewer would make.",
        "Also name the limitation that should appear later in the paper.",
        "",
        JSON.stringify(proposal, null, 2)
      ].join("\n")
    );

    const proposalText = proposalMarkdown(proposal);
    await writeTextFile(paths.proposal, proposalText, overwrite);
    await writeTextFile(paths.proposalCritique, `# Reviewer Critique\n\n${critique.trim()}`, overwrite);
    await appendAutoDecision("Milestone 2", [
      "- Auto-generated: proposal draft and skeptical reviewer critique.",
      "- Human checkpoint created: explicit proposal approval is required before the rest of the pipeline can proceed."
    ]);
    await setAwaitingGate(stage, "approve-proposal", {
      proposal: proposalText,
      critique
    });
    return {
      ok: true,
      status: "awaiting_human_gate"
    };
  } catch (error) {
    await markStageError(stage, error);
    throw error;
  }
}
