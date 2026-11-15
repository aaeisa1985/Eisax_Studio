import type { AIProvider } from "./types";
import { DemoProvider } from "./demo";

/**
 * Provider selection. An OpenAI-compatible adapter can be added later behind
 * env config; until the user explicitly configures external AI credentials,
 * the deterministic offline demo provider is the ONLY provider used.
 */
export function getAiProvider(): AIProvider {
  // const base = process.env.AI_BASE_URL;
  // const key = process.env.AI_API_KEY;
  // if (process.env.AI_PROVIDER === "openai-compatible" && base && key) {
  //   return new OpenAICompatibleProvider(base, key, process.env.AI_MODEL ?? "gpt-4o-mini");
  // }
  return new DemoProvider();
}
