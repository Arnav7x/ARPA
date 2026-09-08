import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getProjectPaths } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: { name: string } }
) {
  const fileName = decodeURIComponent(params.name);
  // Basic security: prevent directory traversal
  const safeName = path.basename(fileName);
  const paths = getProjectPaths();
  const filePath = path.join(paths.figuresDir, safeName);

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(safeName).toLowerCase();
    let contentType = "application/octet-stream";

    if (ext === ".svg") {
      contentType = "image/svg+xml";
    } else if (ext === ".png") {
      contentType = "image/png";
    } else if (ext === ".csv") {
      contentType = "text/csv; charset=utf-8";
    } else if (ext === ".json") {
      contentType = "application/json; charset=utf-8";
    }

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "Figure not found" }, { status: 404 });
  }
}
