import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { exportDocx } from "@/lib/pipeline/assemble-paper";
import { completePeerReview, finalizePeerReviewLog } from "@/lib/pipeline/peer-review";
import { createLlmClient } from "@/lib/llm";
import { appendDecisionLog, getProjectPaths, readJsonFile, readPipelineState, readTextFile, writeJsonFile, writePipelineState, writeTextFile } from "@/lib/storage";
import { extractMarkdownSection, replaceMarkdownSection } from "@/lib/utils";
import { writeWordCountReport } from "@/lib/pipeline/helpers";

const BodySchema = z.object({
  response: z.string().min(1),
  applyRevision: z.boolean(),
  revisionDescription: z.string().optional(),
  revisionText: z.string().optional()
});

function extractSuggestedRevision(suggestion: string) {
  const match = suggestion.match(/Revision:\s*([\s\S]*)$/i);
  return match?.[1]?.trim() ?? suggestion.trim();
}

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const paths = getProjectPaths();
  const state = await readPipelineState();
  const gate = state.humanGate;
  if (gate?.type !== "peer-review" || !gate.pending) {
    return NextResponse.json({ error: "No pending peer-review gate was found." }, { status: 409 });
  }

  const comments = (gate.payload.comments as Array<{ comment: string; section: string }>) ?? [];
  const currentIndex = Number(gate.payload.currentIndex ?? 0);
  const current = comments[currentIndex];
  if (!current) {
    return NextResponse.json({ error: "Peer-review state is missing the current comment." }, { status: 409 });
  }

  const suggestion = String(gate.payload.suggestion ?? "");
  let paperDraft = await readTextFile(paths.paperDraft);
  const approvedRevision = parsed.data.revisionText?.trim() || extractSuggestedRevision(suggestion);
  if (parsed.data.applyRevision && approvedRevision) {
    const validSections = ["Abstract", "Introduction", "Literature Review", "Methodology", "Results", "Discussion", "Conclusion", "References"];
    const targetSection = validSections.find((s) => s.toLowerCase() === (current.section || "").toLowerCase());

    if (targetSection) {
      paperDraft = replaceMarkdownSection(paperDraft, targetSection, approvedRevision);
    } else {
      const entryTitle = current.section && current.section !== "General" ? current.section : `Comment ${currentIndex + 1}`;
      if (paperDraft.includes("## Reviewer Revision Addendum")) {
        paperDraft = `${paperDraft.trimEnd()}\n\n### ${entryTitle}\n${approvedRevision}\n`;
      } else {
        paperDraft = `${paperDraft.trimEnd()}\n\n## Reviewer Revision Addendum\n\n### ${entryTitle}\n${approvedRevision}\n`;
      }
    }
    await writeTextFile(paths.paperDraft, paperDraft, true);
    await exportDocx(paperDraft);
  }

  const existingResponses = (await readJsonFile<Array<Record<string, string>>>(paths.peerReviewResponses).catch(() => [])) as Array<Record<string, string>>;
  const nextResponses = [
    ...existingResponses,
    {
      comment: current.comment,
      section: current.section || "General",
      response: parsed.data.response,
      revision: parsed.data.applyRevision
        ? `Y - ${parsed.data.revisionDescription?.trim() || "Revision applied"}`
        : `N - ${parsed.data.revisionDescription?.trim() || "No revision applied"}`
    }
  ];
  await writeJsonFile(paths.peerReviewResponses, nextResponses, true);

  const nextIndex = currentIndex + 1;
  if (nextIndex >= comments.length) {
    await finalizePeerReviewLog(
      nextResponses.map((row) => ({
        comment: String(row.comment),
        section: String(row.section),
        response: String(row.response),
        revision: String(row.revision)
      }))
    );
    const citationFlags = paperDraft.split(/\r?\n/).filter((line) => line.includes("[CITATION NEEDS VERIFICATION]"));
    await writeWordCountReport(paperDraft, citationFlags);
    await appendDecisionLog("- Human approved: all peer review responses and revision decisions.");
    await completePeerReview();
    return NextResponse.json({ ok: true, completed: true });
  }

  const llm = createLlmClient();
  const nextComment = comments[nextIndex];
  const sectionText = nextComment.section ? extractMarkdownSection(paperDraft, nextComment.section) : paperDraft.slice(0, 8000);
  const nextSuggestion = await llm.generateText(
    "peer_review_suggestion",
    [
      "Draft a concise response to the reviewer comment and, if appropriate, a revised version of the targeted paper section.",
      "Return plain text with 'Response:' followed by 'Revision:'.",
      "",
      `COMMENT:\n${nextComment.comment}`,
      `SECTION:\n${nextComment.section || "General"}`,
      `CURRENT TEXT:\n${sectionText}`
    ].join("\n")
  );
  await writePipelineState({
    ...state,
    status: "awaiting_human_gate",
    humanGate: {
      type: "peer-review",
      pending: true,
      payload: {
        comments,
        currentIndex: nextIndex,
        suggestion: nextSuggestion
      }
    },
    peerReview: {
      commentsFile: state.peerReview?.commentsFile,
      currentIndex: nextIndex,
      total: comments.length
    }
  });
  return NextResponse.json({ ok: true, completed: false, nextIndex });
}
