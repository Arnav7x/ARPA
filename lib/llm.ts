import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

import { getConfig, PrimaryLlmProvider } from "@/lib/config";

type LlmProvider = PrimaryLlmProvider | "google";

export interface LlmClient {
  generateText(taskName: string, prompt: string, provider?: LlmProvider): Promise<string>;
  generateJson<T>(taskName: string, prompt: string, provider?: LlmProvider): Promise<T>;
}

function uniqueCandidates(candidates: string[]) {
  return Array.from(new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean)));
}

function jsonCandidates(text: string) {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  const candidates = [trimmed];

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    candidates.push(match[1]);
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  return uniqueCandidates(candidates);
}

export function parseLlmJson<T>(taskName: string, text: string): T {
  let lastError: unknown;
  for (const candidate of jsonCandidates(text)) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      lastError = error;
    }
  }

  const preview = text.trim().slice(0, 180).replace(/\s+/g, " ");
  throw new Error(`Model response for '${taskName}' was not valid JSON after cleanup: ${String(lastError)}. Preview: ${preview}`);
}

function getMockText(taskName: string) {
  const responses: Record<string, string> = {
    literature_synthesis: JSON.stringify({
      themes: [
        {
          theme: "Transparency",
          agreements: ["Transparent systems tend to improve trust."],
          conflicts: ["Performance impacts remain mixed."],
          gaps: ["Few cross-domain comparisons exist."]
        },
        {
          theme: "Human Oversight",
          agreements: ["Oversight reduces operational risk."],
          conflicts: ["Escalation quality varies by team context."],
          gaps: ["No common metric for escalation timing."]
        }
      ],
      papers: [
        {
          filename: "mock-paper-1.pdf",
          methodology: "Survey",
          keyFinding: "Transparency predicts trust.",
          acknowledgedGaps: ["No longitudinal follow-up"]
        }
      ],
      gapList: [
        "Trust and oversight are rarely studied together.",
        "Reviewer expertise is often uncontrolled.",
        "Escalation timing remains under-specified."
      ]
    }),
    candidate_research_questions: JSON.stringify({
      candidateQuestions: Array.from({ length: 5 }).map((_, index) => ({
        label: `RQ${index + 1}`,
        question: `Mock research question ${index + 1}`,
        feasibilityNote: "Feasible with survey and workflow data.",
        sourcePapers: ["mock-paper-1.pdf"]
      }))
    }),
    proposal: JSON.stringify({
      problemStatement: "Mock problem statement.",
      hypotheses: [
        "Higher transparency is associated with higher trust.",
        "Structured oversight leads to higher quality than unstructured oversight.",
        "Higher trust predicts lower workload after controlling for experience."
      ],
      researchQuestions: ["RQ A", "RQ B", "RQ C"],
      expectedContributions: {
        theoretical: "Mock theoretical contribution.",
        practical: "Mock practical contribution."
      }
    }),
    proposal_retry: JSON.stringify({
      problemStatement: "Mock problem statement.",
      hypotheses: [
        "Higher transparency is associated with higher trust.",
        "Structured oversight leads to higher quality than unstructured oversight.",
        "Higher trust predicts lower workload after controlling for experience."
      ],
      researchQuestions: ["RQ A", "RQ B", "RQ C"],
      expectedContributions: {
        theoretical: "Mock theoretical contribution.",
        practical: "Mock practical contribution."
      }
    }),
    proposal_critique: "The second hypothesis is most vulnerable because team composition may explain quality differences.",
    methodology: JSON.stringify({
      hypotheses: [
        {
          id: "H1",
          hypothesis: "Higher transparency is associated with higher trust.",
          statisticalTest: "pearson_correlation",
          unitOfAnalysis: "Reviewer",
          sampleSizeGuidance: "At least 150 cases",
          assumptions: ["Approximate normality", "Linear relationship"],
          operationalization: "Likert composites",
          variables: [
            { name: "transparency_score", type: "continuous", role: "independent", description: "Transparency" },
            { name: "trust_score", type: "continuous", role: "dependent", description: "Trust" }
          ]
        }
      ]
    }),
    dataset_blueprint: JSON.stringify({
      variables: [
        { name: "transparency_score", type: "continuous", distribution: "normal", mean: 4.8, std: 1.1 },
        { name: "trust_score", type: "continuous", distribution: "normal", mean: 5.1, std: 1.0 }
      ],
      relationships: [
        { outcome: "trust_score", predictors: [{ name: "transparency_score", weight: 0.7 }], noiseStd: 0.6 }
      ]
    }),
    results_section: "Mock results section grounded in supplied JSON values.",
    discussion_section: "Mock discussion connected to prior literature and critique.",
    discussion_adversarial_review: "- Mock adversarial review item.",
    discussion_revision: "Mock revised discussion with limitation handling.",
    literature_review_section: "Mock literature review prose.",
    introduction_section: "Mock introduction.",
    conclusion_section: "Mock conclusion.",
    abstract_section: "Mock abstract.",
    peer_review_suggestion: "Response: Mock response.\nRevision: Mock revised section text."
  };

  const fallback = responses[taskName];
  if (!fallback) {
    throw new Error(`No mock LLM response configured for task '${taskName}'.`);
  }
  return fallback;
}

export function createLlmClient(): LlmClient {
  const config = getConfig();
  const primaryProvider = config.llmProvider;

  return {
    async generateText(taskName, prompt, provider = primaryProvider) {
      if (config.mockLlm) {
        return getMockText(taskName);
      }

      if (provider === "anthropic") {
        if (!config.anthropicApiKey) {
          throw new Error(`Missing ANTHROPIC_API_KEY for task '${taskName}'.`);
        }
        const client = new Anthropic({ apiKey: config.anthropicApiKey });
        const response = await client.messages.create({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 4096,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }]
        });
        return response.content
          .map((block) => ("text" in block ? block.text : ""))
          .join("")
          .trim();
      }

      if (provider === "groq") {
        if (!config.groqApiKey) {
          throw new Error(`Missing GROQ_API_KEY for task '${taskName}'.`);
        }
        const client = new OpenAI({
          apiKey: config.groqApiKey,
          baseURL: "https://api.groq.com/openai/v1"
        });
        const response = await client.responses.create({
          model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
          temperature: 0.2,
          input: prompt
        });
        return response.output_text.trim();
      }

      if (provider === "openai") {
        if (!config.openaiApiKey) {
          throw new Error(`Missing OPENAI_API_KEY for task '${taskName}'.`);
        }
        const client = new OpenAI({ apiKey: config.openaiApiKey });
        const response = await client.responses.create({
          model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
          temperature: 0.2,
          input: prompt
        });
        return response.output_text.trim();
      }

      if (!config.googleApiKey) {
        throw new Error("Missing GOOGLE_API_KEY for Google dataset assistance.");
      }
      const client = new GoogleGenAI({ apiKey: config.googleApiKey });
      const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt
      });
      return response.text?.trim() ?? "";
    },

    async generateJson(taskName, prompt, provider = primaryProvider) {
      const text = await this.generateText(taskName, prompt, provider);
      return parseLlmJson(taskName, text);
    }
  };
}
