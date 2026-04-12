import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  hostnameFromHttpUrl,
  upsertTelegramConfigSchema,
  updateTelegramConfigSchema,
  sendTelegramMessageSchema,
  miniAppAuthSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { agentService } from "../services/index.js";
import { telegramService } from "../services/telegram.js";
import { mergeHostnameIntoFileAllowedHostnames } from "../services/instance-network-file.js";
import { assertCompanyAccess } from "./authz.js";
import { logger } from "../middleware/logger.js";

export function telegramRoutes(db: Db) {
  const router = Router();
  const agents = agentService(db);
  const telegram = telegramService(db);

  async function resolveAgent(req: Request, res: Response) {
    const agentId = req.params.agentId as string;
    const agent = await agents.getById(agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return null;
    }
    assertCompanyAccess(req, agent.companyId);
    return agent;
  }

  router.get("/agents/:agentId/telegram", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;

    const config = await telegram.getConfig(agent.id);
    const botInstance = telegram.getActiveBot(agent.id);
    const telemetry = await telegram.getTelemetry(agent.id);
    res.json({
      config: config ?? null,
      status: botInstance ? "connected" : config?.enabled ? "disconnected" : "disabled",
      telemetry,
    });
  });

  router.put(
    "/agents/:agentId/telegram",
    validate(upsertTelegramConfigSchema),
    async (req, res) => {
      const agent = await resolveAgent(req, res);
      if (!agent) return;

      const config = await telegram.upsertConfig({
        agentId: agent.id,
        companyId: agent.companyId,
        botToken: req.body.botToken,
        enabled: req.body.enabled,
        allowedUserIds: req.body.allowedUserIds,
        requireMention: req.body.requireMention,
        mentionPatterns: req.body.mentionPatterns,
      });

      const botInstance = telegram.getActiveBot(agent.id);
      res.json({
        config,
        status: botInstance ? "connected" : config.enabled ? "starting" : "disabled",
      });
    },
  );

  router.patch(
    "/agents/:agentId/telegram",
    validate(updateTelegramConfigSchema),
    async (req, res) => {
      const agent = await resolveAgent(req, res);
      if (!agent) return;

      const config = await telegram.updateConfig({
        agentId: agent.id,
        botToken: req.body.botToken,
        enabled: req.body.enabled,
        ownerChatId: req.body.ownerChatId,
        allowedUserIds: req.body.allowedUserIds,
        requireMention: req.body.requireMention,
        mentionPatterns: req.body.mentionPatterns,
        miniAppEnabled: req.body.miniAppEnabled,
        miniAppUrl: req.body.miniAppUrl,
      });

      if (!config) {
        res.status(404).json({ error: "Telegram config not found. Use PUT to create." });
        return;
      }

      let miniAppHostnameMerge: { ok: true; hostname: string; added: boolean } | { ok: false; error: string } | null =
        null;
      const mergeAllowed = req.body.mergeMiniAppHostnameToAllowedHosts !== false;
      // Only merge when the client explicitly sends miniAppUrl in this request (avoid re-merge on unrelated PATCHes).
      const urlToMerge = req.body.miniAppUrl !== undefined ? req.body.miniAppUrl : null;
      if (mergeAllowed && urlToMerge) {
        const host = hostnameFromHttpUrl(urlToMerge);
        if (host && req.actor.type === "board" && (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) {
          const mergeResult = mergeHostnameIntoFileAllowedHostnames(host);
          if (mergeResult.ok) {
            miniAppHostnameMerge = {
              ok: true,
              hostname: mergeResult.hostname,
              added: mergeResult.added,
            };
          } else {
            miniAppHostnameMerge = { ok: false, error: mergeResult.error };
            logger.warn(
              { err: mergeResult.error, host, agentId: agent.id },
              "telegram: could not merge mini app hostname into allowed hostnames",
            );
          }
        }
      }

      const botInstance = telegram.getActiveBot(agent.id);
      res.json({
        config,
        status: botInstance ? "connected" : config.enabled ? "starting" : "disabled",
        miniAppHostnameMerge,
      });
    },
  );

  router.delete("/agents/:agentId/telegram", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;

    const deleted = await telegram.deleteConfig(agent.id);
    if (!deleted) {
      res.status(404).json({ error: "Telegram config not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post(
    "/agents/:agentId/telegram/send",
    validate(sendTelegramMessageSchema),
    async (req, res) => {
      const agent = await resolveAgent(req, res);
      if (!agent) return;

      try {
        const sent = await telegram.sendNotification(agent.id, req.body.text, {
          sessionId: req.body.sessionId,
          mediaType: req.body.mediaType,
          mediaUrl: req.body.mediaUrl,
          mediaPath: req.body.mediaPath,
          caption: req.body.caption,
        });
        if (!sent) {
          const botInstance = telegram.getActiveBot(agent.id);
          const config = await telegram.getConfig(agent.id);
          const reason = !config?.enabled
            ? "Telegram is not enabled for this agent"
            : !botInstance
              ? "Telegram bot is not running (server may need restart)"
              : "No target chat ID — ownerChatId not set and no matching session found";
          res.status(422).json({ error: reason });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send message";
        res.status(500).json({ error: message });
      }
    },
  );

  router.post("/agents/:agentId/telegram/test", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;

    const { botToken } = req.body;
    if (!botToken || typeof botToken !== "string" || botToken.trim().length < 10) {
      res.status(400).json({ error: "botToken is required" });
      return;
    }

    try {
      const result = await telegram.testToken(botToken.trim());
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid bot token";
      res.status(400).json({ error: message });
    }
  });

  // Mini App auth endpoint — no agent context required, validates via initData HMAC
  router.post(
    "/telegram/mini-app/auth",
    validate(miniAppAuthSchema),
    async (req, res) => {
      try {
        const result = await telegram.miniAppAuth(req.body.initData, req.body.botId);
        if ("error" in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Mini App authentication failed";
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
