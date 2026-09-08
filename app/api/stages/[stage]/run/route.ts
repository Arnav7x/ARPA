import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireStageConfig } from "@/lib/config";
import { runAllStages, runStage } from "@/lib/pipeline";
import { StageName } from "@/lib/types";

const BodySchema = z.object({
  overwrite: z.boolean().optional(),
  style: z.enum(["apa", "ieee"]).optional(),
  n: z.number().int().positive().optional(),
  publicDatasetPath: z.string().optional()
});

export async function POST(request: NextRequest, { params }: { params: { stage: string } }) {
  const { stage } = params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (stage !== "run-all") {
      requireStageConfig(stage as StageName);
    } else {
      requireStageConfig("run-all");
    }
    const result =
      stage === "run-all" ? await runAllStages(parsed.data) : await runStage(stage as StageName, parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
