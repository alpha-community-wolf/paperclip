import type { AdapterModel } from "@paperclipai/adapter-utils";

/**
 * Comprehensive model list for Hermes Agent, organized by provider.
 * Hermes supports any model available through OpenRouter, Anthropic direct,
 * or OpenAI direct APIs. This list covers commonly used models.
 */
export const hermesModels: AdapterModel[] = [
  // Anthropic
  { id: "anthropic/claude-opus-4", label: "Claude Opus 4 (Anthropic)" },
  { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6 (Anthropic)" },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4 (Anthropic)" },
  { id: "anthropic/claude-haiku-3.5", label: "Claude Haiku 3.5 (Anthropic)" },

  // OpenAI
  { id: "openai/gpt-4.1", label: "GPT-4.1 (OpenAI)" },
  { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini (OpenAI)" },
  { id: "openai/o3", label: "o3 (OpenAI)" },
  { id: "openai/o3-mini", label: "o3 Mini (OpenAI)" },
  { id: "openai/o4-mini", label: "o4 Mini (OpenAI)" },

  // Google
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Google)" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Google)" },
  { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash (Google)" },

  // DeepSeek
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1" },
  { id: "deepseek/deepseek-chat-v3", label: "DeepSeek Chat V3" },

  // Nous
  { id: "nousresearch/hermes-3-llama-3.1-405b", label: "Hermes 3 405B (Nous)" },

  // Meta
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick (Meta)" },
  { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout (Meta)" },

  // Qwen
  { id: "qwen/qwen3-235b-a22b", label: "Qwen 3 235B (Alibaba)" },
  { id: "qwen/qwen3-32b", label: "Qwen 3 32B (Alibaba)" },

  // Mistral
  { id: "mistralai/mistral-large-2", label: "Mistral Large 2" },
  { id: "mistralai/codestral-latest", label: "Codestral (Mistral)" },
];

export async function listHermesModels(): Promise<AdapterModel[]> {
  return hermesModels;
}
