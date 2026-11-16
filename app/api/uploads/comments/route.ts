import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { ensureProjectStructure, getProjectPaths } from "@/lib/storage";
import { fileToBuffer } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("comments");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No comments file was uploaded." }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (![".txt", ".csv", ".rtf"].includes(ext)) {
    return NextResponse.json({ error: "Comments must be uploaded as a .txt, .csv, or .rtf file." }, { status: 400 });
  }

  const paths = getProjectPaths();
  await ensureProjectStructure(paths);
  const target = ext.toLowerCase() === ".csv" ? path.join(paths.dataDir, "peer_comments.csv") : paths.commentsUpload;
  await fs.writeFile(target, await fileToBuffer(file));
  return NextResponse.json({ ok: true, uploaded: path.basename(target) });
}
