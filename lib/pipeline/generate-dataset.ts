import { createLlmClient } from "@/lib/llm";
import { getConfig } from "@/lib/config";
import { getProjectPaths, readJsonFile, writeJsonFile, writeTextFile } from "@/lib/storage";
import { allRequiredVariableNames, appendAutoDecision, markStageComplete, markStageError, parseCsv, setStageRunning, writeCsv } from "@/lib/pipeline/helpers";
import { markdownTable } from "@/lib/utils";

interface DatasetBlueprintVariable {
  name: string;
  type: string;
  distribution?: string;
  mean?: number;
  std?: number;
  low?: number;
  high?: number;
  probability?: number;
  categories?: string[];
  probabilities?: number[];
}

interface DatasetRelationship {
  outcome: string;
  predictors: Array<{ name: string; weight: number }>;
  noiseStd?: number;
  link?: "logit";
}

interface MethodologyPlan {
  hypotheses: Array<{
    variables: Array<{ name: string; type: string; role: string }>;
  }>;
}

function gaussianRandom(mean = 0, std = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function baseSeries(spec: DatasetBlueprintVariable, size: number): Array<string | number> {
  const variableType = spec.type.toLowerCase();
  const distribution = spec.distribution?.toLowerCase() ?? "normal";
  if (["binary", "bool", "boolean"].includes(variableType)) {
    const p = spec.probability ?? 0.5;
    return Array.from({ length: size }, () => (Math.random() < p ? 1 : 0));
  }
  if (["categorical", "category"].includes(variableType)) {
    const categories = spec.categories ?? ["A", "B", "C"];
    const probabilities = spec.probabilities ?? categories.map(() => 1 / categories.length);
    return Array.from({ length: size }, () => {
      let accumulator = 0;
      const roll = Math.random();
      for (let index = 0; index < categories.length; index += 1) {
        accumulator += probabilities[index] ?? 0;
        if (roll <= accumulator) {
          return categories[index];
        }
      }
      return categories[categories.length - 1];
    });
  }
  if (distribution === "uniform") {
    const low = spec.low ?? 0;
    const high = spec.high ?? 1;
    return Array.from({ length: size }, () => low + Math.random() * (high - low));
  }
  return Array.from({ length: size }, () => gaussianRandom(spec.mean ?? 0, Math.max(spec.std ?? 1, 0.01)));
}

function normalizeRows(rows: Array<Record<string, string | number>>, variables: Array<{ name: string; type: string }>) {
  return rows.map((row) => {
    const next: Record<string, string | number> = { ...row };
    for (const variable of variables) {
      const current = next[variable.name];
      if (current === undefined || current === null || current === "") {
        continue;
      }
      const type = variable.type.toLowerCase();
      if (["continuous", "numeric", "float"].includes(type)) {
        next[variable.name] = Number(current);
      } else if (["integer", "int"].includes(type)) {
        next[variable.name] = Math.round(Number(current));
      } else if (["binary", "bool", "boolean"].includes(type)) {
        next[variable.name] = Number(current) > 0 ? 1 : 0;
      } else {
        next[variable.name] = String(current);
      }
    }
    return next;
  });
}

function applyRelationships(
  rows: Array<Record<string, string | number>>,
  relationships: DatasetRelationship[]
) {
  for (const relation of relationships) {
    for (const row of rows) {
      let total = 0;
      for (const predictor of relation.predictors) {
        const raw = row[predictor.name];
        const numeric = typeof raw === "number" ? raw : Number(raw);
        total += (Number.isFinite(numeric) ? numeric : 0) * predictor.weight;
      }
      const noise = gaussianRandom(0, relation.noiseStd ?? 1);
      if (relation.link === "logit") {
        const probability = 1 / (1 + Math.exp(-(total + noise)));
        row[relation.outcome] = Math.random() < Math.min(Math.max(probability, 0.05), 0.95) ? 1 : 0;
      } else {
        row[relation.outcome] = total + noise;
      }
    }
  }
}

function validateSchema(rows: Array<Record<string, string | number>>, requiredColumns: string[]) {
  const present = new Set(Object.keys(rows[0] ?? {}));
  return requiredColumns.filter((column) => !present.has(column));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

function std(values: number[]) {
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function dataQualityMarkdown(
  rows: Array<Record<string, string | number>>,
  variables: Array<{ name: string; type: string }>,
  provenance: "real" | "synthetic",
  mismatches: string[]
) {
  const tableRows = variables.map((variable) => {
    const values = rows.map((row) => row[variable.name]).filter((value) => value !== undefined && value !== null && value !== "");
    const missingPct = ((rows.length - values.length) / Math.max(rows.length, 1)) * 100;
    const numericValues = values.filter((value) => typeof value === "number") as number[];
    const sigma = numericValues.length ? std(numericValues) : 0;
    const avg = numericValues.length ? mean(numericValues) : 0;
    const outliers = sigma
      ? numericValues.filter((value) => Math.abs((value - avg) / sigma) > 4).length
      : 0;
    return [variable.name, variable.type, values[0] === undefined ? "unknown" : typeof values[0], `${missingPct.toFixed(2)}%`, String(outliers)];
  });

  return [
    "# Data Quality Report",
    "",
    `- Dataset provenance: ${provenance}`,
    `- Unresolved schema mismatches: ${mismatches.length ? mismatches.join(", ") : "None"}`,
    "",
    "## Column Checks",
    markdownTable(["Column", "Expected Type", "Observed Type", "Missingness", "Outliers |z|>4"], tableRows),
    ""
  ].join("\n");
}

export async function runGenerateDataset(options: { overwrite?: boolean; n?: number; publicDatasetPath?: string } = {}) {
  const stage = "generate-dataset" as const;
  const llm = createLlmClient();
  const config = getConfig();
  const paths = getProjectPaths();
  await setStageRunning(stage);

  try {
    const methodologyPlan = await readJsonFile<MethodologyPlan>(paths.methodologyPlan);
    const variables = methodologyPlan.hypotheses.flatMap((hypothesis) => hypothesis.variables);
    const uniqueVariables = Array.from(new Map(variables.map((variable) => [variable.name, variable])).values());
    const requiredColumns = allRequiredVariableNames(methodologyPlan);

    let rows: Array<Record<string, string | number>> = [];
    let provenance: "real" | "synthetic" = "synthetic";
    let blueprint: unknown = { variables: uniqueVariables, relationships: [] };

    if (options.publicDatasetPath) {
      rows = await parseCsv(options.publicDatasetPath);
      provenance = "real";
    } else {
      const provider = config.googleApiKey ? "google" : config.llmProvider;
      const datasetBlueprint = await llm.generateJson<{
        variables: DatasetBlueprintVariable[];
        relationships: DatasetRelationship[];
      }>(
        "dataset_blueprint",
        [
          "Create a dataset blueprint as valid JSON with keys variables and relationships.",
          "variables: list of objects with name, type, distribution, mean/std or categories.",
          "relationships: list of objects with outcome, predictors, noiseStd, optional link.",
          "Make the distributions realistic and consistent with the hypotheses.",
          "",
          JSON.stringify(methodologyPlan, null, 2)
        ].join("\n"),
        provider
      );
      blueprint = datasetBlueprint;
      const size = options.n ?? 500;
      const columns = new Map<string, Array<string | number>>();
      for (const variable of uniqueVariables) {
        const spec = datasetBlueprint.variables.find((item) => item.name === variable.name) ?? {
          name: variable.name,
          type: variable.type
        };
        columns.set(variable.name, baseSeries(spec, size));
      }
      rows = Array.from({ length: size }, (_, index) => {
        const row: Record<string, string | number> = {};
        for (const variable of uniqueVariables) {
          row[variable.name] = columns.get(variable.name)?.[index] ?? "";
        }
        return row;
      });
      applyRelationships(rows, datasetBlueprint.relationships);
    }

    rows = normalizeRows(rows, uniqueVariables);
    const mismatches = validateSchema(rows, requiredColumns);
    if (mismatches.length) {
      throw new Error(`Dataset schema mismatches remain unresolved: ${mismatches.join(", ")}`);
    }

    await writeCsv(paths.dataset, rows, options.overwrite);
    await writeJsonFile(
      paths.datasetProvenance,
      {
        provenance,
        rows: rows.length,
        generatedAt: new Date().toISOString()
      },
      options.overwrite
    );
    await writeJsonFile(`${paths.intermediateDir}/dataset_blueprint.json`, blueprint, options.overwrite);
    await writeTextFile(paths.dataQualityReport, dataQualityMarkdown(rows, uniqueVariables, provenance, mismatches), options.overwrite);
    await appendAutoDecision("Milestone 3B", [
      `- Auto-generated: ${provenance} dataset, provenance metadata, and data quality report.`
    ]);
    await markStageComplete(stage);
    return { ok: true, status: "completed" };
  } catch (error) {
    await markStageError(stage, error);
    throw error;
  }
}
