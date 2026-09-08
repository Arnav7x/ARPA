import fs from "node:fs/promises";

import { createLlmClient } from "@/lib/llm";
import { getProjectPaths, readPipelineState, readTextFile, writeJsonFile, writePipelineState, writeTextFile } from "@/lib/storage";
import { appendAutoDecision, ensureCommentsFile, markPipelineComplete, markStageError, parseCsv, setAwaitingGate, setStageRunning } from "@/lib/pipeline/helpers";

function cleanRtf(text: string): string {
  if (!text.includes("{\\rtf")) return text;
  return text
    .replace(/\{\\[^{}]*\}/g, "") // remove font/color/stylesheet tables
    .replace(/\\[a-zA-Z0-9]+(?:\s|-?\d+)?/g, " ") // remove control words
    .replace(/[{}]/g, "") // remove curly braces
    .replace(/\\\n/g, "\n")
    .replace(/\\/g, "");
}

function parsePlainTextComments(raw: string) {
  const cleaned = cleanRtf(raw);
  const rawLines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^[\\{};\s]+$/.test(line)) return false;
      if (line.startsWith("cocoartf") || line.startsWith("fonttbl") || line.startsWith("colortbl")) return false;
      return true;
    });

  let currentSection = "General";
  const results: Array<{ comment: string; section: string }> = [];

  for (const line of rawLines) {
    if (/^reviewer\s*#?\d+/i.test(line)) {
      currentSection = line;
      continue;
    }
    if (/^section\s*:\s*(.+)$/i.test(line)) {
      const match = line.match(/^section\s*:\s*(.+)$/i);
      currentSection = match?.[1]?.trim() || "General";
      continue;
    }
    // Clean leading numbers/bullets like "1. ", "1) ", "- "
    const normalized = line.replace(/^[\d]+[\.\)]\s*/, "").replace(/^[-*•]\s*/, "").trim();
    if (normalized && normalized.length > 3) {
      results.push({ comment: normalized, section: currentSection });
    }
  }

  if (results.length === 0 && rawLines.length > 0) {
    return rawLines.map((comment) => ({ comment, section: "General" }));
  }

  return results;
}

async function loadComments(filePath: string) {
  if (filePath.toLowerCase().endsWith(".csv")) {
    const rows = await parseCsv(filePath);
    return rows
      .map((row) => ({
        comment: String(row.comment ?? row.Comment ?? ""),
        section: String(row.section ?? row.Section ?? "")
      }))
      .filter((row) => row.comment);
  }
  return parsePlainTextComments(await readTextFile(filePath));
}

export async function runPeerReview() {
  const stage = "peer-review" as const;
  const llm = createLlmClient();
  const paths = getProjectPaths();
  await setStageRunning(stage);

  try {
    const commentsFile = await ensureCommentsFile();
    const comments = await loadComments(commentsFile);
    if (!comments.length) {
      throw new Error("No comments found in the uploaded peer-review file.");
    }
    const first = comments[0];
    const paperDraft = await readTextFile(paths.paperDraft);
    const suggestion = await llm.generateText(
      "peer_review_suggestion",
      [
        "Draft a concise response to the reviewer comment and, if appropriate, a revised version of the targeted paper section.",
        "Return plain text with 'Response:' followed by 'Revision:'.",
        "",
        `COMMENT:\n${first.comment}`,
        `SECTION:\n${first.section || "General"}`,
        `CURRENT PAPER:\n${paperDraft.slice(0, 8000)}`
      ].join("\n")
    );
    await appendAutoDecision("Milestone 7", [
      "- Human checkpoint created: each reviewer comment must be approved or edited by a person before being applied."
    ]);
    await writeJsonFile(paths.peerReviewResponses, [], true);
    await setAwaitingGate(stage, "peer-review", {
      comments,
      currentIndex: 0,
      suggestion
    });
    const state = await readPipelineState();
    await writePipelineState({
      ...state,
      peerReview: {
        commentsFile,
        currentIndex: 0,
        total: comments.length
      }
    });
    return { ok: true, status: "awaiting_human_gate", totalComments: comments.length };
  } catch (error) {
    await markStageError(stage, error);
    throw error;
  }
}

export async function finalizePeerReviewLog(rows: Array<{ comment: string; section: string; response: string; revision: string }>) {
  const paths = getProjectPaths();
  const markdown = [
    "# Peer Review Log",
    "",
    "| Comment | Section | Response | Revision Made |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.comment.replaceAll("|", "/")} | ${(row.section || "General").replaceAll("|", "/")} | ${row.response.replaceAll("|", "/")} | ${row.revision.replaceAll("|", "/")} |`
    )
  ].join("\n");
  await writeTextFile(paths.peerReviewLog, markdown, true);
}

export async function readPeerReviewLogRows() {
  const paths = getProjectPaths();
  try {
    const raw = await fs.readFile(paths.peerReviewLog, "utf8");
    return raw;
  } catch {
    return "";
  }
}

export async function completePeerReview() {
  await markPipelineComplete("peer-review");
}
