import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendDecisionLog, getProjectPaths, readPipelineState, writeJsonFile, writePipelineState } from "@/lib/storage";
import { markStageComplete } from "@/lib/pipeline/helpers";

const BodySchema = z.object({
  selectionType: z.enum(["candidate", "custom"]),
  label: z.string().min(1),
  question: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const paths = getProjectPaths();
  const state = await readPipelineState();
  if (state.humanGate?.type !== "select-question" || !state.humanGate.pending) {
    return NextResponse.json({ error: "No pending research-question selection gate was found." }, { status: 409 });
  }
  await writeJsonFile(paths.selectedQuestion, parsed.data, true);
  await appendDecisionLog(`- Human approved: selected research question '${parsed.data.question}'.`);
  await markStageComplete("ingest-literature", { selectedQuestion: parsed.data });
  await writePipelineState({
    ...(await readPipelineState()),
    selectedQuestion: parsed.data
  });
  return NextResponse.json({ ok: true });
}
