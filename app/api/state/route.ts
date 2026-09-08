import { NextResponse } from "next/server";

import { listArtifacts, readPipelineState } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [state, artifacts] = await Promise.all([readPipelineState(), listArtifacts()]);
  return NextResponse.json(
    { state, artifacts },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0"
      }
    }
  );
}
