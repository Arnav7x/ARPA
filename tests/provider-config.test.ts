import { afterEach, describe, expect, it } from "vitest";

import { getConfig, requireStageConfig } from "@/lib/config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("primary LLM provider configuration", () => {
  it("defaults to OpenAI as the primary provider", () => {
    delete process.env.LLM_PROVIDER;
    expect(getConfig().llmProvider).toBe("openai");
  });

  it("allows real pipeline stages with only an OpenAI key when LLM_PROVIDER=openai", () => {
    process.env.MOCK_LLM = "0";
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => requireStageConfig("run-all")).not.toThrow();
  });

  it("requires an Anthropic key only when LLM_PROVIDER=anthropic", () => {
    process.env.MOCK_LLM = "0";
    process.env.LLM_PROVIDER = "anthropic";
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => requireStageConfig("run-all")).toThrow("ANTHROPIC_API_KEY");
  });
});
