import { createLlmClient } from "@/lib/llm";
import { getConfig } from "@/lib/config";
import { getProjectPaths, readTextFile, writeTextFile } from "@/lib/storage";
import { appendAutoDecision, collectResultJsonFiles, markStageComplete, markStageError, setStageRunning } from "@/lib/pipeline/helpers";
import { findUnmatchedNumbers, flattenNumbers } from "@/lib/utils";

function resultsFactSheet(results: Array<Record<string, unknown>>) {
  return results.map((result) => `## ${String(result.hypothesisId)}\n${JSON.stringify(result, null, 2)}`).join("\n\n");
}

export async function runDraftResults(overwrite = false) {
  const stage = "draft-results" as const;
  const llm = createLlmClient();
  const config = getConfig();
  const paths = getProjectPaths();
  await setStageRunning(stage);

  try {
    const results = await collectResultJsonFiles();
    const gapMap = await readTextFile(paths.gapMap);
    const critique = await readTextFile(paths.proposalCritique);
    const facts = resultsFactSheet(results);

    const resultsSection = await llm.generateText(
      "results_section",
      [
        "Draft a Results section using only the numeric values present in the supplied JSON.",
        "Do not invent any statistic, sample size, effect size, or p-value.",
        "Use cautious academic phrasing and organize the prose by hypothesis.",
        "",
        facts
      ].join("\n")
    );

    const discussionDraft = await llm.generateText(
      "discussion_section",
      [
        "Draft a Discussion section that connects the results to the literature and explicitly addresses the skeptical critique as a limitation or counter-argument.",
        "Do not invent any new numeric statistics.",
        "",
        `RESULTS:\n${resultsSection}`,
        "",
        `LITERATURE GAP MAP:\n${gapMap}`,
        "",
        `REVIEWER CRITIQUE:\n${critique}`
      ].join("\n")
    );

    let adversarialReview = "# Adversarial Review\n\nOpenAI adversarial review was not configured.";
    let discussion = discussionDraft.trim();

    if (config.openaiApiKey) {
      const review = await llm.generateText(
        "discussion_adversarial_review",
        [
          "Find logical gaps, unsupported claims, and unaddressed alternative explanations in the Discussion draft below.",
          "Return concise markdown bullets only.",
          "",
          discussionDraft
        ].join("\n"),
        "openai"
      );
      adversarialReview = `# Adversarial Review\n\n${review.trim()}`;
      discussion = (
        await llm.generateText(
          "discussion_revision",
          [
            "Revise the Discussion draft to address the adversarial review findings where possible, or frame unresolved issues as limitations.",
            "Do not add any new numbers.",
            "",
            `DISCUSSION:\n${discussionDraft}`,
            "",
            `ADVERSARIAL REVIEW:\n${review}`
          ].join("\n")
        )
      ).trim();
    }

    const allowedNumbers = new Set<string>();
    results.forEach((result) => flattenNumbers(result).forEach((value) => allowedNumbers.add(value)));
    const unmatched = findUnmatchedNumbers(resultsSection, allowedNumbers);
    const numberTrace = [
      "# Number Trace Report",
      "",
      unmatched.length
        ? "- Unmatched numeric claims requiring human review:"
        : "- All numeric claims in the Results section matched analysis JSON values.",
      ...unmatched.map((value) => `- ${value}`)
    ].join("\n");

    await writeTextFile(paths.adversarialReview, adversarialReview, overwrite);
    await writeTextFile(paths.numberTraceReport, numberTrace, overwrite);
    await writeTextFile(
      paths.resultsDiscussion,
      ["# Results and Discussion", "", "## Results", resultsSection.trim(), "", "## Discussion", discussion].join("\n"),
      overwrite
    );
    await appendAutoDecision("Milestone 5", [
      "- Auto-generated: Results and Discussion draft, number trace validation, and optional adversarial review log.",
      `- Human review note: ${unmatched.length ? "Results include unmatched numeric strings that should be checked." : "No unmatched numeric strings were detected."}`
    ]);
    await markStageComplete(stage);
    return { ok: true, status: "completed", unmatchedNumbers: unmatched };
  } catch (error) {
    await markStageError(stage, error);
    throw error;
  }
}
