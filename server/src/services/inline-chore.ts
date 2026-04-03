/**
 * Inline chore runner — lightweight server-side LLM calls for background tasks.
 *
 * Unlike `triggerChore()` which spawns a full agent run (adapter process),
 * inline chores make a direct HTTP call to the Anthropic Messages API.
 * This is appropriate for simple, single-turn tasks like title generation
 * that don't need tools, file access, or agent context.
 */
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { secretService } from "./secrets.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_CHORE_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";

interface InlineChoreMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Resolve the Anthropic API key for an agent.
 *
 * Checks (in order):
 *   1. Agent adapter config env (may be a secret reference — resolved through secrets service)
 *   2. `process.env.ANTHROPIC_API_KEY`
 */
async function resolveAnthropicApiKey(
  db: Db,
  companyId: string,
  adapterConfig: Record<string, unknown> | null,
): Promise<string | null> {
  if (adapterConfig) {
    const secrets = secretService(db);
    const { config: resolved } = await secrets.resolveAdapterConfigForRuntime(
      companyId,
      adapterConfig,
    );
    const env = resolved.env as Record<string, string> | undefined;
    if (env?.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;
  }
  return process.env.ANTHROPIC_API_KEY ?? null;
}

/** Parse the choreModel from adapter config, falling back to the default. */
function resolveChoreModel(adapterConfig: Record<string, unknown> | null): string {
  const raw = adapterConfig?.choreModel;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const model = raw.trim();
    // Hermes-style IDs like "anthropic/claude-haiku-3.5" — strip the provider prefix
    if (model.startsWith("anthropic/")) return model.slice("anthropic/".length);
    return model;
  }
  return DEFAULT_CHORE_MODEL;
}

export function inlineChoreService(db: Db) {
  return {
    /**
     * Generate a short title for a chat session from its first messages.
     *
     * Returns null if the LLM call fails (caller should treat as non-fatal).
     */
    generateSessionTitle: async (
      agentId: string,
      messages: InlineChoreMessage[],
    ): Promise<string | null> => {
      const agent = await db
        .select({
          id: agents.id,
          companyId: agents.companyId,
          adapterConfig: agents.adapterConfig,
        })
        .from(agents)
        .where(eq(agents.id, agentId))
        .then((rows) => rows[0] ?? null);

      if (!agent) {
        logger.warn({ agentId }, "inline-chore: agent not found for title generation");
        return null;
      }

      const config = (agent.adapterConfig ?? null) as Record<string, unknown> | null;
      const apiKey = await resolveAnthropicApiKey(db, agent.companyId, config);
      if (!apiKey) {
        logger.warn({ agentId }, "inline-chore: no Anthropic API key available for title generation");
        return null;
      }

      const model = resolveChoreModel(config);

      const systemPrompt =
        "You are a concise title generator. Given the start of a conversation, " +
        "produce a short descriptive title (3-8 words). " +
        "Return ONLY the title text, nothing else. No quotes, no punctuation at the end. " +
        "Examples: Deploying budget page, Telegram bot config help, Fix CI pipeline timeout";

      try {
        const response = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: 30,
            system: systemPrompt,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          logger.warn(
            { agentId, model, status: response.status, body: body.slice(0, 200) },
            "inline-chore: Anthropic API error for title generation",
          );
          return null;
        }

        const data = (await response.json()) as {
          content?: Array<{ type: string; text?: string }>;
        };
        const text = data.content?.find((c) => c.type === "text")?.text?.trim();
        if (!text) {
          logger.warn({ agentId, model }, "inline-chore: empty response from title generation");
          return null;
        }

        // Trim to a reasonable length
        return text.length > 100 ? text.slice(0, 100) : text;
      } catch (err) {
        logger.warn({ err, agentId, model }, "inline-chore: title generation failed");
        return null;
      }
    },
  };
}
