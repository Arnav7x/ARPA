import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendDecisionLog, readPipelineState, writePipelineState } from "@/lib/storage";
import { markStageComplete } from "@/lib/pipeline/helpers";

const BodySchema = z.object({
  approved: z.boolean()
});

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const state = await readPipelineState();
  if (state.humanGate?.type !== "approve-proposal" || !state.humanGate.pending) {
    return NextResponse.json({ error: "No pending proposal approval gate was found." }, { status: 409 });
  }
  if (!parsed.data.approved) {
    await writePipelineState({
      ...state,
      status: "idle",
      humanGate: undefined,
      proposalApproved: false,
      lastError: "Proposal was not approved. Revise it before continuing."
    });
    return NextResponse.json({ ok: true, approved: false });
  }
  await appendDecisionLog("- Human approved: proposal and reviewer critique.");
  await markStageComplete("generate-proposal", { proposalApproved: true });
  return NextResponse.json({ ok: true, approved: true });
}
