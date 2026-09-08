import { createLlmClient } from "@/lib/llm";
import { getProjectPaths, readTextFile, writeJsonFile, writeTextFile } from "@/lib/storage";
import { appendAutoDecision, markStageComplete, markStageError, setStageRunning } from "@/lib/pipeline/helpers";
import { markdownTable } from "@/lib/utils";

interface MethodologyVariable {
  name: string;
  type: string;
  role: string;
  description: string;
}

interface MethodologyHypothesis {
  id: string;
  hypothesis: string;
  statisticalTest: string;
  unitOfAnalysis: string;
  sampleSizeGuidance: string;
  assumptions: string[];
  operationalization: string;
  variables: MethodologyVariable[];
}

interface MethodologyPlan {
  hypotheses: MethodologyHypothesis[];
}

function methodologyMarkdown(plan: MethodologyPlan) {
  const rows = plan.hypotheses.map((item) => [
    item.id,
    item.hypothesis,
    item.statisticalTest,
    item.unitOfAnalysis,
    item.sampleSizeGuidance,
    item.variables.map((variable) => `${variable.name} (${variable.type}, ${variable.role})`).join("; ")
  ]);

  return [
    "# Methodology",
    "",
    "## Statistical Plan",
    markdownTable(
      ["Hypothesis ID", "Hypothesis", "Statistical Test", "Unit of Analysis", "Sample Size Guidance", "Variables"],
      rows
    ),
    "",
    "## Assumptions and Notes",
    "",
    ...plan.hypotheses.flatMap((item) => [
      `### ${item.id}`,
      `- Assumptions: ${item.assumptions.join("; ")}`,
      `- Operationalization: ${item.operationalization}`,
      ""
    ])
  ].join("\n");
}

export async function runDesignMethodology(overwrite = false) {
  const stage = "design-methodology" as const;
  const llm = createLlmClient();
  const paths = getProjectPaths();
  await setStageRunning(stage);

  try {
    const proposal = await readTextFile(paths.proposal);
    const plan = await llm.generateJson<MethodologyPlan>(
      "methodology",
      [
        "Convert the proposal below into a methodology plan.",
        "Return valid JSON with key hypotheses.",
        "Each hypothesis must include id, hypothesis, statisticalTest, unitOfAnalysis, sampleSizeGuidance, assumptions, operationalization, variables.",
        "variables must be a list of {name, type, role, description}.",
        "Use test names supported by this system such as linear_regression, pearson_correlation, independent_t_test, anova, chi_square.",
        "",
        proposal
      ].join("\n")
    );

    if (!plan.hypotheses.length) {
      throw new Error("Methodology plan did not include any hypotheses.");
    }

    await writeTextFile(paths.methodology, methodologyMarkdown(plan), overwrite);
    await writeJsonFile(paths.methodologyPlan, plan, overwrite);
    await appendAutoDecision("Milestone 3A", [
      "- Auto-generated: methodology plan, statistical tests, variables, and sample size guidance."
    ]);
    await markStageComplete(stage);
    return { ok: true, status: "completed" };
  } catch (error) {
    await markStageError(stage, error);
    throw error;
  }
}
