import fs from "node:fs/promises";

export function markdownTable(headers: string[], rows: Array<Array<string | number>>) {
  const head = `| ${headers.join(" | ")} |`;
  const rule = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function countWords(text: string) {
  return (text.match(/\b\w+\b/g) ?? []).length;
}

export function extractMarkdownSection(markdown: string, heading: string) {
  const match = markdown.match(new RegExp(`^## ${escapeForRegex(heading)}\\n([\\s\\S]*?)(?=^## |$)`, "m"));
  return match?.[1]?.trim() ?? "";
}

export function replaceMarkdownSection(markdown: string, heading: string, body: string) {
  const sectionRegex = new RegExp(`(^## ${escapeForRegex(heading)}\\n)([\\s\\S]*?)(?=^## |$)`, "m");
  if (sectionRegex.test(markdown)) {
    return markdown.replace(sectionRegex, `$1${body.trim()}\n\n`);
  }
  return `${markdown.trimEnd()}\n\n## ${heading}\n${body.trim()}\n`;
}

export function flattenNumbers(payload: unknown): Set<string> {
  const values = new Set<string>();

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const child of Object.values(value as Record<string, unknown>)) visit(child);
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      values.add(String(value));
      for (let precision = 0; precision <= 4; precision += 1) {
        values.add(value.toFixed(precision));
      }
    }
  };

  visit(payload);
  return values;
}

export function findUnmatchedNumbers(text: string, allowed: Set<string>) {
  const matches = text.match(/(?<![\w/])[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const unmatched: string[] = [];
  for (const value of matches) {
    const normalized = value.replace(/^\+/, "");
    if (!allowed.has(normalized) && !unmatched.includes(normalized)) {
      unmatched.push(normalized);
    }
  }
  return unmatched;
}

export async function fileToBuffer(file: File) {
  return Buffer.from(await file.arrayBuffer());
}

export async function safeReadDir(target: string) {
  try {
    return await fs.readdir(target);
  } catch {
    return [];
  }
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
