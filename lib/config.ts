import { StageName } from "@/lib/types";

export type PrimaryLlmProvider = "openai" | "anthropic" | "groq";

export interface AppConfig {
  anthropicApiKey?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  notionApiKey?: string;
  notionParentPageId?: string;
  llmProvider: PrimaryLlmProvider;
  mockLlm: boolean;
}

function readPrimaryProvider(): PrimaryLlmProvider {
  const rawProvider = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();
  if (rawProvider === "anthropic" || rawProvider === "groq") {
    return rawProvider;
  }
  return "openai";
}

export function getConfig(): AppConfig {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    notionApiKey: process.env.NOTION_API_KEY,
    notionParentPageId: process.env.NOTION_PARENT_PAGE_ID,
    llmProvider: readPrimaryProvider(),
    // The project is designed to run as a self-contained demo by default.
    // Set MOCK_LLM=0 only when a configured external provider is intentional.
    mockLlm: ["1", "true", "yes"].includes((process.env.MOCK_LLM ?? "1").toLowerCase())
  };
}

const llmRequiredStages = new Set<StageName>([
  "ingest-literature",
  "generate-proposal",
  "design-methodology",
  "generate-dataset",
  "draft-results",
  "assemble-paper",
  "run-all"
]);

export function requireStageConfig(stage: StageName) {
  const config = getConfig();
  if (config.mockLlm || !llmRequiredStages.has(stage)) {
    return config;
  }

  if (config.llmProvider === "openai" && !config.openaiApiKey) {
    throw new Error(
      `Missing required environment variable OPENAI_API_KEY for stage '${stage}' because LLM_PROVIDER=openai.`
    );
  }

  if (config.llmProvider === "anthropic" && !config.anthropicApiKey) {
    throw new Error(
      `Missing required environment variable ANTHROPIC_API_KEY for stage '${stage}' because LLM_PROVIDER=anthropic.`
    );
  }

  if (config.llmProvider === "groq" && !config.groqApiKey) {
    throw new Error(`Missing required environment variable GROQ_API_KEY for stage '${stage}' because LLM_PROVIDER=groq.`);
  }

  return config;
}
