import { randomUUID } from "node:crypto";
import { Bot } from "grammy";
import { run as grammyRun, type RunnerHandle } from "@grammyjs/runner";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, agentTelegramConfigs, chatMessages, chatSessions } from "@paperclipai/db";
import type { AgentTelegramConfig, AgentTelegramTestResult } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { subscribeCompanyLiveEvents } from "./live-events.js";
import { chatService } from "./chat.js";
import { heartbeatService } from "./heartbeat.js";

const TELEGRAM_MESSAGE_LIMIT = 4096;
const RUN_POLL_INTERVAL_MS = 2000;
const RUN_POLL_MAX_ATTEMPTS = 300; // 10 min max wait

interface BotInstance {
  bot: Bot;
  runner: RunnerHandle;
  agentId: string;
  companyId: string;
  unsubscribeLiveEvents: () => void;
}

type ConfigRow = typeof agentTelegramConfigs.$inferSelect;

function toApiConfig(row: ConfigRow): AgentTelegramConfig {
  return {
    id: row.id,
    companyId: row.companyId,
    agentId: row.agentId,
    botUsername: row.botUsername,
    enabled: row.enabled,
    allowedUserIds: (row.allowedUserIds as string[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MESSAGE_LIMIT) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MESSAGE_LIMIT) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", TELEGRAM_MESSAGE_LIMIT);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(" ", TELEGRAM_MESSAGE_LIMIT);
    if (splitAt <= 0) splitAt = TELEGRAM_MESSAGE_LIMIT;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

export function telegramService(db: Db) {
  const activeBots = new Map<string, BotInstance>();
  const chat = chatService(db);
  const heartbeat = heartbeatService(db);

  async function getConfig(agentId: string): Promise<ConfigRow | null> {
    return db
      .select()
      .from(agentTelegramConfigs)
      .where(eq(agentTelegramConfigs.agentId, agentId))
      .then((rows) => rows[0] ?? null);
  }

  async function getConfigApi(agentId: string): Promise<AgentTelegramConfig | null> {
    const row = await getConfig(agentId);
    return row ? toApiConfig(row) : null;
  }

  async function upsertConfig(input: {
    agentId: string;
    companyId: string;
    botToken: string;
    enabled?: boolean;
    allowedUserIds?: string[];
  }): Promise<AgentTelegramConfig> {
    const existing = await getConfig(input.agentId);
    const now = new Date();

    if (existing) {
      const [updated] = await db
        .update(agentTelegramConfigs)
        .set({
          botToken: input.botToken,
          enabled: input.enabled ?? existing.enabled,
          allowedUserIds: input.allowedUserIds ?? existing.allowedUserIds,
          updatedAt: now,
        })
        .where(eq(agentTelegramConfigs.id, existing.id))
        .returning();
      if (!updated) throw new Error("Failed to update telegram config");

      await onConfigChange(input.agentId);
      return toApiConfig(updated);
    }

    const [created] = await db
      .insert(agentTelegramConfigs)
      .values({
        companyId: input.companyId,
        agentId: input.agentId,
        botToken: input.botToken,
        enabled: input.enabled ?? false,
        allowedUserIds: input.allowedUserIds ?? [],
      })
      .returning();
    if (!created) throw new Error("Failed to create telegram config");

    await onConfigChange(input.agentId);
    return toApiConfig(created);
  }

  async function updateConfig(input: {
    agentId: string;
    botToken?: string;
    enabled?: boolean;
    allowedUserIds?: string[];
  }): Promise<AgentTelegramConfig | null> {
    const existing = await getConfig(input.agentId);
    if (!existing) return null;

    const patch: Partial<typeof agentTelegramConfigs.$inferInsert> = { updatedAt: new Date() };
    if (input.botToken !== undefined) patch.botToken = input.botToken;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.allowedUserIds !== undefined) patch.allowedUserIds = input.allowedUserIds;

    const [updated] = await db
      .update(agentTelegramConfigs)
      .set(patch)
      .where(eq(agentTelegramConfigs.id, existing.id))
      .returning();
    if (!updated) return null;

    await onConfigChange(input.agentId);
    return toApiConfig(updated);
  }

  async function deleteConfig(agentId: string): Promise<boolean> {
    await stopBot(agentId);
    const rows = await db
      .delete(agentTelegramConfigs)
      .where(eq(agentTelegramConfigs.agentId, agentId))
      .returning();
    return rows.length > 0;
  }

  async function testToken(token: string): Promise<AgentTelegramTestResult> {
    const testBot = new Bot(token);
    const me = await testBot.api.getMe();
    return {
      ok: true,
      botId: me.id,
      botUsername: me.username,
      firstName: me.first_name,
    };
  }

  async function findOrCreateTelegramSession(input: {
    agentId: string;
    companyId: string;
    telegramChatId: string;
  }) {
    const existing = await db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.agentId, input.agentId),
          eq(chatSessions.telegramChatId, input.telegramChatId),
        ),
      )
      .then((rows) => rows[0] ?? null);
    if (existing) return existing;

    const sessionId = randomUUID();
    const [created] = await db
      .insert(chatSessions)
      .values({
        id: sessionId,
        companyId: input.companyId,
        agentId: input.agentId,
        taskKey: `telegram:${input.telegramChatId}`,
        title: "Telegram chat",
        telegramChatId: input.telegramChatId,
      })
      .returning();
    return created!;
  }

  async function waitForRunCompletion(runId: string): Promise<string | null> {
    for (let attempt = 0; attempt < RUN_POLL_MAX_ATTEMPTS; attempt++) {
      const run = await heartbeat.getRun(runId);
      if (!run) return null;

      const status = run.status as string;
      if (status === "succeeded" || status === "failed" || status === "cancelled" || status === "timed_out") {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, RUN_POLL_INTERVAL_MS));
    }
    return null;
  }

  async function getAssistantResponse(messageId: string): Promise<string | null> {
    const sourceMessage = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .then((rows) => rows[0] ?? null);
    if (!sourceMessage?.runId) return null;

    const assistantMsg = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.agentId, sourceMessage.agentId),
          eq(chatMessages.runId, sourceMessage.runId),
          eq(chatMessages.role, "assistant"),
        ),
      )
      .then((rows) => rows[0] ?? null);

    return assistantMsg?.content ?? null;
  }

  function startBot(config: ConfigRow): void {
    if (activeBots.has(config.agentId)) return;

    const bot = new Bot(config.botToken);
    const agentId = config.agentId;
    const companyId = config.companyId;
    const allowedUserIds = new Set((config.allowedUserIds as string[]) ?? []);

    bot.command("start", async (ctx) => {
      const agentRow = await db
        .select({ name: agents.name, title: agents.title })
        .from(agents)
        .where(eq(agents.id, agentId))
        .then((rows) => rows[0]);
      const name = agentRow?.name ?? "Agent";
      const title = agentRow?.title ? ` — ${agentRow.title}` : "";
      await ctx.reply(`Hello! I'm ${name}${title}. Send me a message and I'll get to work.`);
    });

    bot.command("help", async (ctx) => {
      await ctx.reply(
        "Available commands:\n" +
        "/start — Introduction\n" +
        "/help — This message\n" +
        "/status — Check if the agent is available\n" +
        "/reset — Start a new conversation",
      );
    });

    bot.command("status", async (ctx) => {
      const agentRow = await db
        .select({ status: agents.status, name: agents.name })
        .from(agents)
        .where(eq(agents.id, agentId))
        .then((rows) => rows[0]);
      if (!agentRow) {
        await ctx.reply("Agent not found.");
        return;
      }
      await ctx.reply(`${agentRow.name} is currently: ${agentRow.status}`);
    });

    bot.command("reset", async (ctx) => {
      const telegramChatId = String(ctx.chat.id);
      const existing = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.agentId, agentId),
            eq(chatSessions.telegramChatId, telegramChatId),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (existing) {
        await db
          .update(chatSessions)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(chatSessions.id, existing.id));
      }
      await ctx.reply("Conversation reset. Send a new message to start fresh.");
    });

    bot.on("message:text", async (ctx) => {
      const senderId = String(ctx.from.id);
      const telegramChatId = String(ctx.chat.id);

      if (allowedUserIds.size > 0 && !allowedUserIds.has(senderId)) {
        await ctx.reply("You are not authorized to use this bot.");
        return;
      }

      try {
        await ctx.api.sendChatAction(ctx.chat.id, "typing");

        const session = await findOrCreateTelegramSession({
          agentId,
          companyId,
          telegramChatId,
        });

        const result = await chat.createMessage({
          agentId,
          sessionId: session.id,
          content: ctx.message.text,
          actor: { actorType: "system", actorId: `telegram:${senderId}` },
        });

        if (!result.runId) {
          await ctx.reply("The agent could not be woken. Please try again later.");
          return;
        }

        const typingInterval = setInterval(() => {
          ctx.api.sendChatAction(ctx.chat.id, "typing").catch(() => {});
        }, 4000);

        try {
          const status = await waitForRunCompletion(result.runId);

          // Give a moment for assistant message materialization
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // Try to get the materialized assistant message
          let response = await getAssistantResponse(result.message.id);

          // If no materialized message yet, trigger materialization via chat service
          if (!response) {
            try {
              const messages = await chat.listMessages(agentId, session.id);
              const assistantMsg = messages
                .filter((m) => m.runId === result.runId && m.role === "assistant")
                .pop();
              response = assistantMsg?.content ?? null;
            } catch {
              // ignore
            }
          }

          if (!response) {
            if (status === "failed") {
              response = "The agent encountered an error processing your message.";
            } else if (status === "timed_out") {
              response = "The agent timed out processing your message.";
            } else if (status === "cancelled") {
              response = "The agent run was cancelled.";
            } else {
              response = "The agent finished but did not produce a response.";
            }
          }

          const chunks = splitMessage(response);
          for (const chunk of chunks) {
            await ctx.reply(chunk);
          }
        } finally {
          clearInterval(typingInterval);
        }
      } catch (err) {
        logger.error({ err, agentId, telegramChatId }, "telegram: failed to process message");
        try {
          await ctx.reply("Something went wrong. Please try again.");
        } catch {
          // ignore send failure
        }
      }
    });

    bot.catch((err) => {
      logger.error({ err: err.error, agentId }, "telegram: bot error");
    });

    const runner = grammyRun(bot);
    const unsubscribeLiveEvents = subscribeCompanyLiveEvents(companyId, () => {
      // live event listener placeholder for future streaming
    });

    activeBots.set(agentId, { bot, runner, agentId, companyId, unsubscribeLiveEvents });

    void testToken(config.botToken)
      .then(async (info) => {
        if (info.botUsername && info.botUsername !== config.botUsername) {
          await db
            .update(agentTelegramConfigs)
            .set({ botUsername: info.botUsername, updatedAt: new Date() })
            .where(eq(agentTelegramConfigs.agentId, agentId));
        }
        logger.info({ agentId, botUsername: info.botUsername }, "telegram: bot started");
      })
      .catch((err) => {
        logger.warn({ err, agentId }, "telegram: failed to fetch bot info on startup");
      });
  }

  async function stopBot(agentId: string): Promise<void> {
    const instance = activeBots.get(agentId);
    if (!instance) return;

    instance.unsubscribeLiveEvents();
    if (instance.runner.isRunning()) {
      await instance.runner.stop();
    }
    activeBots.delete(agentId);
    logger.info({ agentId }, "telegram: bot stopped");
  }

  async function onConfigChange(agentId: string): Promise<void> {
    await stopBot(agentId);
    const config = await getConfig(agentId);
    if (config?.enabled && config.botToken) {
      startBot(config);
    }
  }

  async function syncAllBots(): Promise<{ started: number; errors: number }> {
    const configs = await db
      .select()
      .from(agentTelegramConfigs)
      .where(eq(agentTelegramConfigs.enabled, true));

    let started = 0;
    let errors = 0;

    for (const config of configs) {
      if (!config.botToken) continue;
      try {
        startBot(config);
        started++;
      } catch (err) {
        logger.error({ err, agentId: config.agentId }, "telegram: failed to start bot on sync");
        errors++;
      }
    }

    return { started, errors };
  }

  async function stopAllBots(): Promise<void> {
    const agentIds = Array.from(activeBots.keys());
    for (const agentId of agentIds) {
      await stopBot(agentId);
    }
  }

  function getActiveBot(agentId: string): BotInstance | undefined {
    return activeBots.get(agentId);
  }

  function getActiveBotCount(): number {
    return activeBots.size;
  }

  return {
    getConfig: getConfigApi,
    upsertConfig,
    updateConfig,
    deleteConfig,
    testToken,
    startBot,
    stopBot,
    syncAllBots,
    stopAllBots,
    onConfigChange,
    getActiveBot,
    getActiveBotCount,
  };
}
