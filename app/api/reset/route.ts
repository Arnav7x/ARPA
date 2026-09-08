import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getProjectPaths, writePipelineState } from "@/lib/storage";

export async function POST() {
  const paths = getProjectPaths();

  try {
    // Reset pipeline state
    await writePipelineState({
      status: "idle",
      completedStages: [],
      lastUpdatedAt: new Date().toISOString()
    });

    // Clean intermediate dir
    try {
      const intermediateFiles = await fs.readdir(paths.intermediateDir);
      await Promise.all(
        intermediateFiles.map((file) => fs.rm(path.join(paths.intermediateDir, file), { force: true, recursive: true }))
      );
    } catch {}

    // Clean outputs (keep directory structure)
    try {
      const outputFiles = await fs.readdir(paths.outputsDir);
      for (const file of outputFiles) {
        const fullPath = path.join(paths.outputsDir, file);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          const subFiles = await fs.readdir(fullPath);
          await Promise.all(subFiles.map((f) => fs.rm(path.join(fullPath, f), { force: true })));
        } else {
          await fs.rm(fullPath, { force: true });
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, message: "Workspace reset successfully." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to reset workspace" },
      { status: 500 }
    );
  }
}
