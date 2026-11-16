import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { ensureProjectStructure, getProjectPaths } from "@/lib/storage";
import { fileToBuffer } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const files = formData.getAll("papers").filter((value): value is File => value instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: "No PDF files were uploaded." }, { status: 400 });
  }
  if (files.some((file) => path.extname(file.name).toLowerCase() !== ".pdf")) {
    return NextResponse.json({ error: "Only PDF research papers can be uploaded." }, { status: 400 });
  }

  const paths = getProjectPaths();
  await ensureProjectStructure(paths);
  await Promise.all(
    files.map(async (file) => {
      const target = path.join(paths.rawPapersDir, path.basename(file.name));
      await fs.writeFile(target, await fileToBuffer(file));
    })
  );
  return NextResponse.json({ ok: true, uploaded: files.map((file) => file.name) });
}
