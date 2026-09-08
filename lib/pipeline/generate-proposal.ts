import { createLlmClient } from "@/lib/llm";
import { getProjectPaths, readTextFile, writeTextFile } from "@/lib/storage";
import { appendAutoDecision, falsifiable, loadSelectedQuestion, markStageError, setAwaitingGate, setStageRunning } from "@/lib/pipeline/helpers";

function proposalMarkdown(payload: {
  problemStatement: string;
  hypotheses: string[];
  researchQuestions: string[];
  expectedContributions: { theoretical: string; practical: string };
}) {
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

    let proposal = await llm.generateJson<{
      problemStatement: string;
      hypotheses: string[];
      researchQuestions: string[];
      expectedContributions: { theoretical: string; practical: string };
    }>("proposal", basePrompt);

    if (proposal.hypotheses.length !== 3 || proposal.hypotheses.some((hypothesis) => !falsifiable(hypothesis))) {
      proposal = await llm.generateJson("proposal_retry", `${basePrompt}\n\nRewrite the hypotheses with measurable comparison language.`);
    }

    if (proposal.hypotheses.length !== 3 || proposal.hypotheses.some((hypothesis) => !falsifiable(hypothesis))) {
      throw new Error("Proposal generation failed the falsifiability check.");
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
