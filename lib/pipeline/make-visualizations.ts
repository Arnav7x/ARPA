import path from "node:path";

import { getProjectPaths, readJsonFile, writeTextFile } from "@/lib/storage";
import {
  appendAutoDecision,
  clearFigureDirectory,
  collectResultJsonFiles,
  markStageComplete,
  markStageError,
  parseCsv,
  setStageRunning,
  writeCsv
} from "@/lib/pipeline/helpers";

const WIDTH = 960;
const HEIGHT = 560;
const PADDING = 64;

function numericColumns(rows: Array<Record<string, string | number>>) {
  const first = rows[0] ?? {};
  return Object.keys(first).filter((key) => rows.some((row) => typeof row[key] === "number"));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

function histogram(values: number[], bins = 8) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min || 1) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  values.forEach((value) => {
    const index = Math.min(bins - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  });
  const labels = counts.map((_, index) => `${(min + index * width).toFixed(1)}-${(min + (index + 1) * width).toFixed(1)}`);
  return { labels, counts };
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function svgFrame(title: string, body: string) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#fbf7ee"/>`,
    `<text x="${PADDING}" y="44" font-family="Aptos, Avenir Next, Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" fill="#1f1a17">${escapeXml(title)}</text>`,
    body,
    `</svg>`
  ].join("");
}

async function writeSvg(fileName: string, svg: string) {
  const paths = getProjectPaths();
  await writeTextFile(path.join(paths.figuresDir, fileName), svg, true);
}

function barChart(title: string, labels: string[], values: number[], fill = "#65735b") {
  const maxValue = Math.max(...values, 1);
  const chartWidth = WIDTH - PADDING * 2;
  const chartHeight = HEIGHT - PADDING * 2;
  const barGap = 10;
  const barWidth = Math.max(12, (chartWidth - barGap * Math.max(values.length - 1, 0)) / Math.max(values.length, 1));
  const bars = values
    .map((value, index) => {
      const height = (value / maxValue) * (chartHeight - 70);
      const x = PADDING + index * (barWidth + barGap);
      const y = HEIGHT - PADDING - height;
      return [
        `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="${fill}" rx="4"/>`,
        `<text x="${x + barWidth / 2}" y="${HEIGHT - PADDING + 22}" font-family="Arial, sans-serif" font-size="11" text-anchor="middle" fill="#5f574b">${escapeXml(labels[index] ?? "")}</text>`,
        `<text x="${x + barWidth / 2}" y="${y - 8}" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#1f1a17">${value.toFixed(1)}</text>`
      ].join("");
    })
    .join("");
  const axes = [
    `<line x1="${PADDING}" y1="${HEIGHT - PADDING}" x2="${WIDTH - PADDING}" y2="${HEIGHT - PADDING}" stroke="#c8bca8"/>`,
    `<line x1="${PADDING}" y1="${PADDING}" x2="${PADDING}" y2="${HEIGHT - PADDING}" stroke="#c8bca8"/>`
  ].join("");
  return svgFrame(title, `${axes}${bars}`);
}

function lineChart(title: string, labels: string[], values: number[]) {
  const maxValue = Math.max(...values, 1);
  const chartWidth = WIDTH - PADDING * 2;
  const chartHeight = HEIGHT - PADDING * 2 - 40;
  const points = values.map((value, index) => {
    const x = PADDING + (index / Math.max(values.length - 1, 1)) * chartWidth;
    const y = HEIGHT - PADDING - (value / maxValue) * chartHeight;
    return { x, y, label: labels[index] ?? "", value };
  });
  const pathData = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const body = [
    `<line x1="${PADDING}" y1="${HEIGHT - PADDING}" x2="${WIDTH - PADDING}" y2="${HEIGHT - PADDING}" stroke="#c8bca8"/>`,
    `<line x1="${PADDING}" y1="${PADDING}" x2="${PADDING}" y2="${HEIGHT - PADDING}" stroke="#c8bca8"/>`,
    `<path d="${pathData}" fill="none" stroke="#9f5f37" stroke-width="4"/>`,
    ...points.map(
      (point) =>
        `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#284b3b"/><text x="${point.x}" y="${HEIGHT - PADDING + 22}" font-family="Arial, sans-serif" font-size="11" text-anchor="middle" fill="#5f574b">${escapeXml(point.label)}</text>`
    )
  ].join("");
  return svgFrame(title, body);
}

function scatterChart(title: string, points: Array<{ x: number; y: number }>, xLabel: string, yLabel: string) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const chartWidth = WIDTH - PADDING * 2;
  const chartHeight = HEIGHT - PADDING * 2;
  const circles = points
    .slice(0, 300)
    .map((point) => {
      const x = PADDING + ((point.x - minX) / Math.max(maxX - minX, 1)) * chartWidth;
      const y = HEIGHT - PADDING - ((point.y - minY) / Math.max(maxY - minY, 1)) * chartHeight;
      return `<circle cx="${x}" cy="${y}" r="4" fill="#8b5e34" opacity="0.68"/>`;
    })
    .join("");
  const body = [
    `<line x1="${PADDING}" y1="${HEIGHT - PADDING}" x2="${WIDTH - PADDING}" y2="${HEIGHT - PADDING}" stroke="#c8bca8"/>`,
    `<line x1="${PADDING}" y1="${PADDING}" x2="${PADDING}" y2="${HEIGHT - PADDING}" stroke="#c8bca8"/>`,
    circles,
    `<text x="${WIDTH / 2}" y="${HEIGHT - 18}" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="#5f574b">${escapeXml(xLabel)}</text>`,
    `<text x="18" y="${HEIGHT / 2}" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="#5f574b" transform="rotate(-90 18 ${HEIGHT / 2})">${escapeXml(yLabel)}</text>`
  ].join("");
  return svgFrame(title, body);
}

async function saveHeatmap(rows: Array<Record<string, string | number>>) {
  const columns = numericColumns(rows).slice(0, 6);
  const correlations = columns.map((left) =>
    columns.map((right) => {
      const pairs = rows
        .map((row) => [Number(row[left]), Number(row[right])] as const)
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      const leftValues = pairs.map(([x]) => x);
      const rightValues = pairs.map(([, y]) => y);
      const avgLeft = mean(leftValues);
      const avgRight = mean(rightValues);
      const numerator = leftValues.reduce((sum, value, index) => sum + (value - avgLeft) * (rightValues[index] - avgRight), 0);
      const denominator = Math.sqrt(
        leftValues.reduce((sum, value) => sum + (value - avgLeft) ** 2, 0) *
          rightValues.reduce((sum, value) => sum + (value - avgRight) ** 2, 0)
      );
      return numerator / (denominator || 1);
    })
  );
  const cell = 68;
  const startX = 180;
  const startY = 92;
  const cells = correlations
    .flatMap((row, rowIndex) =>
      row.map((value, colIndex) => {
        const intensity = Math.round(((value + 1) / 2) * 150);
        const color = `rgb(${205 - Math.round(intensity / 3)}, ${190 - Math.round(intensity / 5)}, ${142 + Math.round(intensity / 4)})`;
        return [
          `<rect x="${startX + colIndex * cell}" y="${startY + rowIndex * cell}" width="${cell}" height="${cell}" fill="${color}" stroke="#fbf7ee"/>`,
          `<text x="${startX + colIndex * cell + cell / 2}" y="${startY + rowIndex * cell + 40}" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="#1f1a17">${value.toFixed(2)}</text>`
        ].join("");
      })
    )
    .join("");
  const labels = columns
    .flatMap((column, index) => [
      `<text x="${startX + index * cell + cell / 2}" y="80" font-family="Arial, sans-serif" font-size="11" text-anchor="middle" fill="#5f574b">${escapeXml(column)}</text>`,
      `<text x="166" y="${startY + index * cell + 40}" font-family="Arial, sans-serif" font-size="11" text-anchor="end" fill="#5f574b">${escapeXml(column)}</text>`
    ])
    .join("");
  await writeSvg("correlation_heatmap.svg", svgFrame("Correlation Heatmap", `${labels}${cells}`));
}

async function makeDistributionPlots(rows: Array<Record<string, string | number>>) {
  const columns = numericColumns(rows).slice(0, 2);
  await Promise.all(
    columns.map(async (column) => {
      const values = rows.map((row) => Number(row[column])).filter(Number.isFinite);
      const { labels, counts } = histogram(values);
      await writeSvg(`distribution_${column}.svg`, barChart(`Distribution of ${column}`, labels, counts, "#65735b"));
    })
  );
}

async function makeEffectPlot(results: Array<Record<string, unknown>>) {
  const labels: string[] = [];
  const values: number[] = [];
  for (const result of results) {
    if (result.testType === "linear_regression") {
      const coefficients = (result.coefficients as Array<Record<string, unknown>>) ?? [];
      for (const coefficient of coefficients) {
        if (coefficient.term === "intercept") continue;
        labels.push(`${String(result.hypothesisId)}:${String(coefficient.term)}`);
        values.push(Number(coefficient.estimate));
      }
    } else if (typeof result.meanDifference === "number") {
      labels.push(String(result.hypothesisId));
      values.push(result.meanDifference);
    } else if (typeof result.correlation === "number") {
      labels.push(String(result.hypothesisId));
      values.push(result.correlation);
    }
  }
  await writeSvg("effect_estimates.svg", barChart("Effect Estimates", labels.length ? labels : ["No effects"], values.length ? values : [0], "#9f5f37"));
}

async function makeGroupComparisonPlots(
  rows: Array<Record<string, string | number>>,
  methodology: { hypotheses: Array<{ id: string; variables: Array<{ name: string; role: string }> }> }
) {
  await Promise.all(
    methodology.hypotheses.map(async (hypothesis) => {
      const group = hypothesis.variables.find((variable) => variable.role === "group");
      const dependent = hypothesis.variables.find((variable) => variable.role === "dependent");
      if (!dependent) return;
      if (group) {
        const groups = Array.from(new Set(rows.map((row) => String(row[group.name]))));
        const means = groups.map((groupValue) =>
          mean(
            rows
              .filter((row) => String(row[group.name]) === groupValue)
              .map((row) => Number(row[dependent.name]))
              .filter(Number.isFinite)
          )
        );
        await writeSvg(`group_comparison_${hypothesis.id}.svg`, barChart(`${hypothesis.id} Group Comparison`, groups, means, "#284b3b"));
      } else {
        const values = rows.map((row) => Number(row[dependent.name])).filter(Number.isFinite);
        const { labels, counts } = histogram(values);
        await writeSvg(`group_comparison_${hypothesis.id}.svg`, lineChart(`${hypothesis.id} Outcome Shape`, labels, counts));
      }
    })
  );
}

async function makeExploratoryPlot(rows: Array<Record<string, string | number>>) {
  const columns = numericColumns(rows).slice(0, 2);
  if (columns.length < 2) return;
  const points = rows
    .map((row) => ({ x: Number(row[columns[0]]), y: Number(row[columns[1]]) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  await writeSvg("exploratory_chart.svg", scatterChart("Exploratory Relationship", points, columns[0], columns[1]));
}

export async function runMakeVisualizations() {
  const stage = "make-visualizations" as const;
  const paths = getProjectPaths();
  await setStageRunning(stage);

  try {
    const rows = await parseCsv(paths.dataset);
    const methodology = await readJsonFile<{ hypotheses: Array<{ id: string; variables: Array<{ name: string; role: string }> }> }>(
      paths.methodologyPlan
    );
    const results = await collectResultJsonFiles();
    await clearFigureDirectory();
    await saveHeatmap(rows);
    await makeDistributionPlots(rows);
    await makeEffectPlot(results);
    await makeGroupComparisonPlots(rows, methodology);
    await makeExploratoryPlot(rows);
    const longRows = rows.flatMap((row, rowIndex) =>
      Object.entries(row).map(([variable, value]) => ({
        row_id: rowIndex + 1,
        variable,
        value
      }))
    );
    await writeCsv(path.join(paths.figuresDir, "tableau_export.csv"), longRows, true);
    await appendAutoDecision("Milestone 4B", [
      "- Auto-generated: SVG figure assets and Tableau-ready export CSV."
    ]);
    await markStageComplete(stage);
    return { ok: true, status: "completed" };
  } catch (error) {
    await markStageError(stage, error);
    throw error;
  }
}
