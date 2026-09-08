import fs from "node:fs/promises";
import path from "node:path";

import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";

import { createLlmClient } from "@/lib/llm";
import { getProjectPaths, readJsonFile, readTextFile, writeTextFile } from "@/lib/storage";
import { appendAutoDecision, loadSelectedQuestion, markStageComplete, markStageError, readPaperMetadata, setStageRunning, writeWordCountReport } from "@/lib/pipeline/helpers";
import { extractMarkdownSection } from "@/lib/utils";

function inferReference(paper: Record<string, string>, index: number, style: "apa" | "ieee") {
  const year = paper.body?.match(/\b(19|20)\d{2}\b/)?.[0] ?? "";
  const author = "";
  const title = paper.title || paper.filename.replace(/\.pdf$/i, "");
  const needsVerification = !author || !year;
  const core =
    style === "ieee"
      ? `[${index}] ${author || "Unknown author"}, "${title}," ${year || "n.d."}.`
      : `${author || "Unknown author"}. (${year || "n.d."}). ${title}.`;
  return `${core}${needsVerification ? " [CITATION NEEDS VERIFICATION]" : ""}`;
}

export async function exportDocx(markdown: string) {
  const paths = getProjectPaths();
  const paragraphs: Paragraph[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("# ")) {
      paragraphs.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.TITLE }));
    } else if (line.startsWith("## ")) {
      paragraphs.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_1 }));
    } else if (line.startsWith("### ")) {
      paragraphs.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith("- ")) {
      paragraphs.push(new Paragraph({ text: line.slice(2), bullet: { level: 0 } }));
    } else if (line.trim()) {
      paragraphs.push(new Paragraph({ children: [new TextRun(line)] }));
    } else {
      paragraphs.push(new Paragraph({ text: "" }));
    }
  }

  try {
    const figureFiles = (await fs.readdir(paths.figuresDir))
      .filter((file) => file.toLowerCase().endsWith(".png"))
      .sort();
    for (const [index, file] of figureFiles.entries()) {
      const buffer = await fs.readFile(path.join(paths.figuresDir, file));
      paragraphs.push(new Paragraph({ text: "" }));
      paragraphs.push(new Paragraph({ text: `Figure ${index + 1}`, heading: HeadingLevel.HEADING_2 }));
      paragraphs.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: buffer,
              transformation: { width: 600, height: 360 }
            })
          ]
        })
      );
      paragraphs.push(new Paragraph({ text: `Figure ${index + 1}. ${file.replace(/_/g, " ").replace(/\.png$/i, "")}` }));
    }

    const svgFiles = (await fs.readdir(paths.figuresDir))
      .filter((file) => file.toLowerCase().endsWith(".svg"))
      .sort();
    if (svgFiles.length > 0) {
      paragraphs.push(new Paragraph({ text: "" }));
      paragraphs.push(new Paragraph({ text: "Generated Figures & Visualizations", heading: HeadingLevel.HEADING_2 }));
      for (const [index, file] of svgFiles.entries()) {
        const cleanTitle = file.replace(/_/g, " ").replace(/\.svg$/i, "");
        paragraphs.push(new Paragraph({ text: `Figure ${index + 1}: ${cleanTitle} (outputs/figures/${file})`, bullet: { level: 0 } }));
      }
    }
  } catch {}

  const document = new Document({
    sections: [{ properties: {}, children: paragraphs }]
  });
  const buffer = await Packer.toBuffer(document);
  await fs.writeFile(paths.paperDocx, buffer);
}

export async function runAssemblePaper(style: "apa" | "ieee" = "apa", overwrite = false) {
  const stage = "assemble-paper" as const;
  const llm = createLlmClient();
  const paths = getProjectPaths();
  await setStageRunning(stage);

  try {
    const selectedQuestion = await loadSelectedQuestion();
    const proposal = await readTextFile(paths.proposal);
    const methodology = await readTextFile(paths.methodology);
    const resultsDiscussion = await readTextFile(paths.resultsDiscussion);
    const gapMap = await readTextFile(paths.gapMap);
    const datasetProvenance = await readJsonFile<{ provenance: string }>(paths.datasetProvenance);
    const paperMetadata = await readPaperMetadata();

    const literatureReview = await llm.generateText(
      "literature_review_section",
      `Rewrite the literature gap map below into a prose literature review section.\n\n${gapMap}`
    );
    const introduction = await llm.generateText(
      "introduction_section",
      `Draft an Introduction section using the proposal below and the selected question.\n\nSelected question: ${selectedQuestion.question}\n\n${proposal}`
    );
    const conclusion = await llm.generateText(
      "conclusion_section",
      `Draft a Conclusion section based on the proposal, methodology, and results.\n\n${proposal}\n\n${methodology}\n\n${resultsDiscussion}`
    );

    const references = paperMetadata.map((paper, index) => inferReference(paper, index + 1, style));
    const citationFlags = references.filter((reference) => reference.includes("[CITATION NEEDS VERIFICATION]"));
    const methodWithProvenance = `${methodology.trim()}\n\n### Dataset Provenance\nThis study used a ${datasetProvenance.provenance} dataset as recorded in data/dataset_provenance.json.`;
    const results = extractMarkdownSection(resultsDiscussion, "Results");
    const discussion = extractMarkdownSection(resultsDiscussion, "Discussion");

    const body = [
      "## Introduction",
      introduction.trim(),
      "",
      "## Literature Review",
      literatureReview.trim(),
      "",
      "## Methodology",
      methodWithProvenance,
      "",
      "## Results",
      results,
      "",
      "## Discussion",
      discussion,
      "",
      "## Conclusion",
      conclusion.trim(),
      "",
      "## References",
      ...references.map((reference) => `- ${reference}`)
    ].join("\n");

    const abstract = await llm.generateText("abstract_section", `Generate an abstract for the completed paper below.\n\n${body}`);
    const fullPaper = ["# Paper Draft", "", "## Abstract", abstract.trim(), "", body].join("\n");

    await writeTextFile(path.join(paths.paperSectionsDir, "assembled_sections.md"), fullPaper, overwrite);
    await writeTextFile(paths.paperDraft, fullPaper, overwrite);
    await exportDocx(fullPaper);
    const wordReport = await writeWordCountReport(fullPaper, citationFlags);
    await appendAutoDecision("Milestone 6", [
      "- Auto-generated: assembled paper markdown, DOCX draft, abstract, and reference list.",
      `- Citation flags surfaced: ${citationFlags.length ? citationFlags.join("; ") : "none"}.`,
      wordReport.totalWords < 8000
        ? `- Word count warning: draft is ${wordReport.totalWords} words and has thin sections requiring expansion.`
        : `- Word count check: draft reached ${wordReport.totalWords} words.`
    ]);
    await markStageComplete(stage);
    return {
      ok: true,
      status: "completed",
      wordCount: wordReport.totalWords,
      thinSections: wordReport.thin,
      citationFlags
    };
  } catch (error) {
    await markStageError(stage, error);
    throw error;
  }
}
