import type { AIProvider } from "./types";
import { DemoProvider } from "./demo";
import { OpenAICompatibleProvider } from "./openai";

/**
 * Provider selection. Uses OpenAICompatibleProvider only when explicitly
 * configured via AI_PROVIDER=openai-compatible + AI_BASE_URL + AI_API_KEY.
 * Otherwise falls back to the deterministic offline demo provider.
 */
export function getAiProvider(): AIProvider {
  const base = process.env.AI_BASE_URL?.trim();
  const key = process.env.AI_API_KEY?.trim();
  if (process.env.AI_PROVIDER === "openai-compatible" && base && key) {
    return new OpenAICompatibleProvider(base, key, process.env.AI_MODEL?.trim() || "gpt-4o-mini");
  }
  return new DemoProvider();
}
