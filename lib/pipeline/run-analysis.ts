import path from "node:path";

import { jStat } from "jstat";
import { inverse, Matrix } from "ml-matrix";

import { getProjectPaths, readJsonFile, writeJsonFile, writeTextFile } from "@/lib/storage";
import { appendAutoDecision, markStageComplete, markStageError, parseCsv, setStageRunning } from "@/lib/pipeline/helpers";
import { markdownTable } from "@/lib/utils";

interface MethodologyVariable {
  name: string;
  type: string;
  role: string;
}

interface MethodologyHypothesis {
  id: string;
  hypothesis: string;
  statisticalTest: string;
  variables: MethodologyVariable[];
}

interface MethodologyPlan {
  hypotheses: MethodologyHypothesis[];
}

function asNumbers(values: Array<string | number>) {
  return values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

function variance(values: number[]) {
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(values.length - 1, 1);
}

function std(values: number[]) {
  return Math.sqrt(variance(values));
}

function normalityPValue(values: number[]) {
  if (values.length < 8) {
    return null;
  }
  const avg = mean(values);
  const sigma = std(values) || 1;
  const skew =
    values.reduce((sum, value) => sum + ((value - avg) / sigma) ** 3, 0) / Math.max(values.length, 1);
  const kurt =
    values.reduce((sum, value) => sum + ((value - avg) / sigma) ** 4, 0) / Math.max(values.length, 1);
  const jb = (values.length / 6) * (skew ** 2 + ((kurt - 3) ** 2) / 4);
  return 1 - jStat.chisquare.cdf(jb, 2);
}

function correlation(x: number[], y: number[]) {
  const meanX = mean(x);
  const meanY = mean(y);
  const numerator = x.reduce((sum, value, index) => sum + (value - meanX) * (y[index] - meanY), 0);
  const denominator = Math.sqrt(
    x.reduce((sum, value) => sum + (value - meanX) ** 2, 0) * y.reduce((sum, value) => sum + (value - meanY) ** 2, 0)
  );
  return numerator / (denominator || 1);
}

function pearsonResult(rows: Array<Record<string, string | number>>, hypothesis: MethodologyHypothesis) {
  const [xVar, yVar] = hypothesis.variables;
  const pairs = rows
    .map((row) => [Number(row[xVar.name]), Number(row[yVar.name])] as const)
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const x = pairs.map(([value]) => value);
  const y = pairs.map(([, value]) => value);
  const r = correlation(x, y);
  const tValue = r * Math.sqrt((x.length - 2) / Math.max(1 - r ** 2, 1e-9));
  const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tValue), x.length - 2));
  const fisherZ = Math.atanh(Math.min(Math.max(r, -0.999999), 0.999999));
  const stderr = 1 / Math.sqrt(Math.max(x.length - 3, 1));
  const ciLow = Math.tanh(fisherZ - 1.96 * stderr);
  const ciHigh = Math.tanh(fisherZ + 1.96 * stderr);
  const warnings: string[] = [];
  const normalityX = normalityPValue(x);
  const normalityY = normalityPValue(y);
  if (normalityX !== null && normalityX < 0.05) warnings.push(`${xVar.name} may violate normality.`);
  if (normalityY !== null && normalityY < 0.05) warnings.push(`${yVar.name} may violate normality.`);
  return {
    hypothesisId: hypothesis.id,
    testType: "pearson_correlation",
    variables: [xVar.name, yVar.name],
    n: x.length,
    correlation: Number(r.toFixed(4)),
    pValue: Number(pValue.toFixed(4)),
    ciLow: Number(ciLow.toFixed(4)),
    ciHigh: Number(ciHigh.toFixed(4)),
    assumptionChecks: {
      normalityXPValue: normalityX === null ? null : Number(normalityX.toFixed(4)),
      normalityYPValue: normalityY === null ? null : Number(normalityY.toFixed(4)),
      warnings
    }
  };
}

function independentTTestResult(rows: Array<Record<string, string | number>>, hypothesis: MethodologyHypothesis) {
  const groupVar = hypothesis.variables.find((variable) => variable.role === "group");
  const outcomeVar = hypothesis.variables.find((variable) => variable.role === "dependent");
  if (!groupVar || !outcomeVar) {
    throw new Error(`${hypothesis.id} needs a group variable and dependent variable.`);
  }
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const group = String(row[groupVar.name]);
    const outcome = Number(row[outcomeVar.name]);
    if (!Number.isFinite(outcome)) continue;
    const bucket = grouped.get(group) ?? [];
    bucket.push(outcome);
    grouped.set(group, bucket);
  }
  const groups = Array.from(grouped.keys());
  if (groups.length !== 2) {
    throw new Error(`${hypothesis.id} independent t-test requires exactly two groups.`);
  }
  const a = grouped.get(groups[0]) ?? [];
  const b = grouped.get(groups[1]) ?? [];
  const meanDiff = mean(a) - mean(b);
  const varA = variance(a);
  const varB = variance(b);
  const stderr = Math.sqrt(varA / a.length + varB / b.length);
  const tValue = meanDiff / (stderr || 1e-9);
  const dfNumerator = (varA / a.length + varB / b.length) ** 2;
  const dfDenominator =
    (varA ** 2) / (a.length ** 2 * Math.max(a.length - 1, 1)) + (varB ** 2) / (b.length ** 2 * Math.max(b.length - 1, 1));
  const degreesOfFreedom = dfNumerator / (dfDenominator || 1);
  const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tValue), degreesOfFreedom));
  const ciLow = meanDiff - 1.96 * stderr;
  const ciHigh = meanDiff + 1.96 * stderr;
  const pooledStd = Math.sqrt((varA + varB) / 2) || 1e-9;
  const leveneRatio = Math.max(varA, varB) / Math.max(Math.min(varA, varB), 1e-9);
  const warnings = leveneRatio > 4 ? ["Variance imbalance may violate homoscedasticity."] : [];

  return {
    hypothesisId: hypothesis.id,
    testType: "independent_t_test",
    groupVariable: groupVar.name,
    outcome: outcomeVar.name,
    groups,
    n: a.length + b.length,
    tStatistic: Number(tValue.toFixed(4)),
    pValue: Number(pValue.toFixed(4)),
    meanDifference: Number(meanDiff.toFixed(4)),
    ciLow: Number(ciLow.toFixed(4)),
    ciHigh: Number(ciHigh.toFixed(4)),
    effectSize: Number((meanDiff / pooledStd).toFixed(4)),
    groupMeans: {
      [groups[0]]: Number(mean(a).toFixed(4)),
      [groups[1]]: Number(mean(b).toFixed(4))
    },
    assumptionChecks: {
      normalityGroupAPValue: normalityPValue(a),
      normalityGroupBPValue: normalityPValue(b),
      varianceRatio: Number(leveneRatio.toFixed(4)),
      warnings
    }
  };
}

function linearRegressionResult(rows: Array<Record<string, string | number>>, hypothesis: MethodologyHypothesis) {
  const dependent = hypothesis.variables.find((variable) => variable.role === "dependent");
  const predictors = hypothesis.variables.filter((variable) => ["independent", "control"].includes(variable.role));
  if (!dependent || !predictors.length) {
    throw new Error(`${hypothesis.id} needs a dependent variable and at least one predictor.`);
  }
  const cleanRows = rows.filter((row) => {
    const outcome = Number(row[dependent.name]);
    if (!Number.isFinite(outcome)) return false;
    return predictors.every((predictor) => Number.isFinite(Number(row[predictor.name])));
  });
  const y = Matrix.columnVector(cleanRows.map((row) => Number(row[dependent.name])));
  const x = new Matrix(
    cleanRows.map((row) => [1, ...predictors.map((predictor) => Number(row[predictor.name]))])
  );
  const xt = x.transpose();
  const xtxInverse = inverse(xt.mmul(x));
  const beta = xtxInverse.mmul(xt).mmul(y);
  const fitted = x.mmul(beta);
  const residuals = y.clone().sub(fitted).to1DArray();
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const degrees = Math.max(cleanRows.length - predictors.length - 1, 1);
  const mse = sse / degrees;
  const covariance = xtxInverse.mul(mse);
  const coeffs = beta.to1DArray();
  const stderr = covariance.diagonal().map((value) => Math.sqrt(value));
  const tValues = coeffs.map((value, index) => value / (stderr[index] || 1e-9));
  const pValues = tValues.map((value) => 2 * (1 - jStat.studentt.cdf(Math.abs(value), degrees)));
  const responseValues = cleanRows.map((row) => Number(row[dependent.name]));
  const totalVariance = responseValues.reduce((sum, value) => sum + (value - mean(responseValues)) ** 2, 0);
  const rSquared = 1 - sse / Math.max(totalVariance, 1e-9);
  const adjustedRSquared = 1 - (1 - rSquared) * ((cleanRows.length - 1) / Math.max(cleanRows.length - predictors.length - 1, 1));
  const modelF = ((totalVariance - sse) / predictors.length) / (sse / degrees || 1e-9);
  const modelP = 1 - jStat.centralF.cdf(modelF, predictors.length, degrees);
  const warnings: string[] = [];
  const residualNormality = normalityPValue(residuals);
  if (residualNormality !== null && residualNormality < 0.05) warnings.push("Residual normality may be violated.");

  return {
    hypothesisId: hypothesis.id,
    testType: "linear_regression",
    outcome: dependent.name,
    predictors: predictors.map((predictor) => predictor.name),
    n: cleanRows.length,
    rSquared: Number(rSquared.toFixed(4)),
    adjustedRSquared: Number(adjustedRSquared.toFixed(4)),
    fStatistic: Number(modelF.toFixed(4)),
    modelPValue: Number(modelP.toFixed(4)),
    coefficients: coeffs.map((value, index) => ({
      term: index === 0 ? "intercept" : predictors[index - 1].name,
      estimate: Number(value.toFixed(4)),
      stdError: Number(stderr[index].toFixed(4)),
      tValue: Number(tValues[index].toFixed(4)),
      pValue: Number(pValues[index].toFixed(4)),
      ciLow: Number((value - 1.96 * stderr[index]).toFixed(4)),
      ciHigh: Number((value + 1.96 * stderr[index]).toFixed(4))
    })),
    assumptionChecks: {
      residualNormalityPValue: residualNormality === null ? null : Number(residualNormality.toFixed(4)),
      warnings
    }
  };
}

function anovaResult(rows: Array<Record<string, string | number>>, hypothesis: MethodologyHypothesis) {
  const groupVar = hypothesis.variables.find((variable) => variable.role === "group");
  const outcomeVar = hypothesis.variables.find((variable) => variable.role === "dependent");
  if (!groupVar || !outcomeVar) {
    throw new Error(`${hypothesis.id} needs a group variable and dependent variable.`);
  }
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const group = String(row[groupVar.name]);
    const outcome = Number(row[outcomeVar.name]);
    if (!Number.isFinite(outcome)) continue;
    const bucket = grouped.get(group) ?? [];
    bucket.push(outcome);
    grouped.set(group, bucket);
  }
  const buckets = Array.from(grouped.entries());
  const all = buckets.flatMap(([, values]) => values);
  const grandMean = mean(all);
  const ssBetween = buckets.reduce((sum, [, values]) => sum + values.length * (mean(values) - grandMean) ** 2, 0);
  const ssWithin = buckets.reduce(
    (sum, [, values]) => sum + values.reduce((inner, value) => inner + (value - mean(values)) ** 2, 0),
    0
  );
  const dfBetween = Math.max(buckets.length - 1, 1);
  const dfWithin = Math.max(all.length - buckets.length, 1);
  const fStatistic = (ssBetween / dfBetween) / Math.max(ssWithin / dfWithin, 1e-9);
  const pValue = 1 - jStat.centralF.cdf(fStatistic, dfBetween, dfWithin);
  return {
    hypothesisId: hypothesis.id,
    testType: "anova",
    groupVariable: groupVar.name,
    outcome: outcomeVar.name,
    n: all.length,
    fStatistic: Number(fStatistic.toFixed(4)),
    pValue: Number(pValue.toFixed(4)),
    groupMeans: Object.fromEntries(buckets.map(([group, values]) => [group, Number(mean(values).toFixed(4))])),
    assumptionChecks: {
      warnings: []
    }
  };
}

function chiSquareResult(rows: Array<Record<string, string | number>>, hypothesis: MethodologyHypothesis) {
  const [first, second] = hypothesis.variables;
  if (!first || !second) {
    throw new Error(`${hypothesis.id} needs two categorical variables.`);
  }
  const firstValues = Array.from(new Set(rows.map((row) => String(row[first.name]))));
  const secondValues = Array.from(new Set(rows.map((row) => String(row[second.name]))));
  const observed = firstValues.map((left) =>
    secondValues.map((right) => rows.filter((row) => String(row[first.name]) === left && String(row[second.name]) === right).length)
  );
  const rowTotals = observed.map((row) => row.reduce((sum, value) => sum + value, 0));
  const colTotals = secondValues.map((_, colIndex) => observed.reduce((sum, row) => sum + row[colIndex], 0));
  const total = rowTotals.reduce((sum, value) => sum + value, 0);
  let chiSquare = 0;
  let minExpected = Number.POSITIVE_INFINITY;
  observed.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const expected = (rowTotals[rowIndex] * colTotals[colIndex]) / Math.max(total, 1);
      minExpected = Math.min(minExpected, expected);
      chiSquare += ((value - expected) ** 2) / Math.max(expected, 1e-9);
    });
  });
  const degrees = Math.max((firstValues.length - 1) * (secondValues.length - 1), 1);
  const pValue = 1 - jStat.chisquare.cdf(chiSquare, degrees);
  const warnings = minExpected < 5 ? ["Expected cell counts fall below 5."] : [];
  return {
    hypothesisId: hypothesis.id,
    testType: "chi_square",
    variables: [first.name, second.name],
    n: total,
    chiSquare: Number(chiSquare.toFixed(4)),
    pValue: Number(pValue.toFixed(4)),
    degreesOfFreedom: degrees,
    assumptionChecks: {
      minimumExpectedCount: Number(minExpected.toFixed(4)),
      warnings
    }
  };
}

function summarize(results: Array<Record<string, unknown>>) {
  const rows = results.map((result) => {
    const pValue = (result.pValue as number | undefined) ?? (result.modelPValue as number | undefined);
    const effect =
      (result.rSquared as number | undefined) ??
      (result.correlation as number | undefined) ??
      (result.meanDifference as number | undefined) ??
      (result.chiSquare as number | undefined) ??
      (result.fStatistic as number | undefined);
    const warnings = ((result.assumptionChecks as { warnings?: string[] } | undefined)?.warnings ?? []).join("; ") || "None";
    return [
      String(result.hypothesisId),
      String(result.testType),
      String(result.n),
      typeof effect === "number" ? effect.toFixed(4) : "n/a",
      typeof pValue === "number" ? pValue.toFixed(4) : "n/a",
      warnings
    ];
  });

  return [
    "# Analysis Summary Table",
    "",
    markdownTable(["Hypothesis", "Test", "N", "Effect / Fit", "p-value", "Warnings"], rows)
  ].join("\n");
}

export async function runAnalysis(overwrite = false) {
  const stage = "run-analysis" as const;
  const paths = getProjectPaths();
  await setStageRunning(stage);

  try {
    const methodology = await readJsonFile<MethodologyPlan>(paths.methodologyPlan);
    const rows = await parseCsv(paths.dataset);
    const results = methodology.hypotheses.map((hypothesis) => {
      switch (hypothesis.statisticalTest.toLowerCase()) {
        case "pearson_correlation":
          return pearsonResult(rows, hypothesis);
        case "independent_t_test":
          return independentTTestResult(rows, hypothesis);
        case "linear_regression":
          return linearRegressionResult(rows, hypothesis);
        case "anova":
          return anovaResult(rows, hypothesis);
        case "chi_square":
          return chiSquareResult(rows, hypothesis);
        default:
          throw new Error(`Unsupported statistical test '${hypothesis.statisticalTest}'.`);
      }
    });

    await Promise.all(
      results.map((result) =>
        writeJsonFile(path.join(paths.analysisDir, `results_${String(result.hypothesisId)}.json`), result, overwrite)
      )
    );
    await writeTextFile(path.join(paths.analysisDir, "summary_table.md"), summarize(results), overwrite);
    await appendAutoDecision("Milestone 4A", [
      "- Auto-generated: structured statistical results JSON files, summary table, and assumption warnings."
    ]);
    await markStageComplete(stage);
    return { ok: true, status: "completed" };
  } catch (error) {
    await markStageError(stage, error);
    throw error;
  }
}
