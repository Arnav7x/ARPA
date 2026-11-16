import { describe, expect, it } from "vitest";

import { parseLlmJson } from "@/lib/llm";

describe("parseLlmJson", () => {
  it("parses plain JSON", () => {
    expect(parseLlmJson("plain", "{\"ok\":true}")).toEqual({ ok: true });
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const response = "```json\n{\"themes\":[{\"theme\":\"Trust\"}]}\n```";
    expect(parseLlmJson("literature_synthesis", response)).toEqual({
      themes: [{ theme: "Trust" }]
    });
  });

  it("parses JSON surrounded by short assistant prose", () => {
    const response = "Here is the structured output:\n\n{\"candidateQuestions\":[{\"label\":\"RQ1\"}]}";
    expect(parseLlmJson("candidate_research_questions", response)).toEqual({
      candidateQuestions: [{ label: "RQ1" }]
    });
  });

  it("parses a JSON object followed by additional assistant prose", () => {
    const response = '{"status":"ok"}\n\nI have completed the task.';
    expect(parseLlmJson("trailing_prose", response)).toEqual({ status: "ok" });
  });
});
