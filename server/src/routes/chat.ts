import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { addChatMessageSchema, createChatSessionSchema, updateChatSessionSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { chatService } from "../services/chat.js";
import { chatReadStateService } from "../services/chat-read-states.js";
import { agentService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

function writeSseEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function chatRoutes(db: Db) {
  const router = Router();
  const chat = chatService(db);
  const chatReadStates = chatReadStateService(db);
  const agents = agentService(db);

  async function resolveAgent(req: Request, res: Response) {
    const agentId = req.params.agentId as string;
    const agent = await agents.getById(agentId as string);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return null;
    }
    assertCompanyAccess(req, agent.companyId);
    return agent;
  }

  router.get("/companies/:companyId/chat/sessions", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === "string" ? Math.min(Math.max(parseInt(limitRaw, 10) || 100, 1), 500) : 100;
    const sessions = await chat.listCompanySessions(companyId, { limit });
    res.json(sessions);
  });

  router.get("/agents/:agentId/chat/unread-sessions", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const actor = getActorInfo(req);
    if (actor.actorType !== "user" || !actor.actorId) {
      res.json({ sessionIds: [] });
      return;
    }
    const sessionIds = await chatReadStates.listUnreadSessionIds(agent.companyId, actor.actorId, agent.id);
    res.json({ sessionIds });
  });

  router.get("/agents/:agentId/chat/sessions", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const includeArchivedRaw = req.query.includeArchived;
    const includeArchived =
      includeArchivedRaw === "true" || includeArchivedRaw === "1";
    const sessions = await chat.listSessions(agent.id, { includeArchived });
    res.json(sessions);
  });

  router.post("/agents/:agentId/chat/sessions", validate(createChatSessionSchema), async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const actor = getActorInfo(req);
    const result = await chat.createSession({
      agentId: agent.id,
      title: req.body.title,
      actor: {
        actorType: actor.actorType,
        actorId: actor.actorId,
      },
    });
    res.status(201).json(result);
  });

  router.patch("/agents/:agentId/chat/sessions/:sessionId", validate(updateChatSessionSchema), async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const sessionId = req.params.sessionId as string;
    const actor = getActorInfo(req);
    const session = await chat.updateSession({
      agentId: agent.id,
      sessionId,
      title: req.body.title,
      archived: req.body.archived,
    });

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "chat.session.updated",
      entityType: "agent",
      entityId: agent.id,
      details: {
        chatSessionId: session.id,
        title: session.title,
        archivedAt: session.archivedAt,
      },
    });

    res.json({ session });
  });

  router.post("/agents/:agentId/chat/sessions/:sessionId/read", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const sessionId = req.params.sessionId as string;
    const actor = getActorInfo(req);
    if (actor.actorType !== "user" || !actor.actorId) {
      res.status(403).json({ error: "Only board users can mark sessions as read" });
      return;
    }
    const session = await chat.getSession(sessionId);
    if (!session || session.agentId !== agent.id || session.companyId !== agent.companyId) {
      res.status(404).json({ error: "Chat session not found" });
      return;
    }
    const result = await chatReadStates.markRead(agent.companyId, sessionId, actor.actorId);
    res.json({ ok: true, lastReadAt: result?.lastReadAt });
  });

  router.get("/agents/:agentId/chat/sessions/:sessionId/messages", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const sessionId = req.params.sessionId as string;
    const messages = await chat.listMessages(agent.id, sessionId);
    res.json(messages);
  });

  router.post(
    "/agents/:agentId/chat/sessions/:sessionId/messages",
    validate(addChatMessageSchema),
    async (req, res) => {
      const agent = await resolveAgent(req, res);
      if (!agent) return;
      const sessionId = req.params.sessionId as string;
      const actor = getActorInfo(req);
      const result = await chat.createMessage({
        agentId: agent.id,
        sessionId,
        content: req.body.content,
        actor: {
          actorType: actor.actorType,
          actorId: actor.actorId,
        },
      });

      await logActivity(db, {
        companyId: agent.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "chat.message.sent",
        entityType: "agent",
        entityId: agent.id,
        details: {
          chatSessionId: result.message.chatSessionId,
          chatMessageId: result.message.id,
          runId: result.runId,
        },
      });

      res.status(201).json(result);
    },
  );

  router.post("/agents/:agentId/chat/sessions/:sessionId/messages/:messageId/retry", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const sessionId = req.params.sessionId as string;
    const messageId = req.params.messageId as string;
    const actor = getActorInfo(req);
    const result = await chat.retryMessage({
      agentId: agent.id,
      sessionId,
      messageId,
      actor: {
        actorType: actor.actorType,
        actorId: actor.actorId,
      },
    });

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "chat.message.retried",
      entityType: "agent",
      entityId: agent.id,
      details: {
        chatSessionId: result.message.chatSessionId,
        chatMessageId: result.message.id,
        runId: result.runId,
      },
    });

    res.json(result);
  });

  router.get("/agents/:agentId/chat/sessions/:sessionId/messages/:messageId/stream", async (req, res) => {
    const sessionId = req.params.sessionId as string;
    const messageId = req.params.messageId as string;
    const agent = await resolveAgent(req, res);
    if (!agent) return;

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    try {
      await chat.streamMessageResponse({
        agentId: agent.id,
        sessionId,
        messageId,
        isClosed: () => closed,
        onReady: ({ runId }) => writeSseEvent(res, "ready", { runId }),
        onLog: (chunk) => writeSseEvent(res, "log", chunk),
        onComplete: ({ runId, status, message }) =>
          writeSseEvent(res, "completed", {
            runId,
            status,
            message,
          }),
      });
    } catch (error) {
      writeSseEvent(res, "error", {
        error: error instanceof Error ? error.message : "Chat stream failed",
      });
    } finally {
      res.end();
    }
  });

  // Legacy endpoints kept for backward compatibility during rollout.
  router.get("/agents/:agentId/chat/messages", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const session = await chat.getOrCreateDefaultSession(agent.id);
    const messages = await chat.listMessages(agent.id, session.id);
    res.json(messages);
  });

  router.post("/agents/:agentId/chat/messages", validate(addChatMessageSchema), async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const session = await chat.getOrCreateDefaultSession(agent.id);
    const actor = getActorInfo(req);
    const result = await chat.createMessage({
      agentId: agent.id,
      sessionId: session.id,
      content: req.body.content,
      actor: {
        actorType: actor.actorType,
        actorId: actor.actorId,
      },
    });

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "chat.message.sent",
      entityType: "agent",
      entityId: agent.id,
      details: {
        chatSessionId: result.message.chatSessionId,
        chatMessageId: result.message.id,
        runId: result.runId,
      },
    });

    res.status(201).json(result);
  });

  router.post("/agents/:agentId/chat/messages/:messageId/retry", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const messageId = req.params.messageId as string;
    const message = await chat.getMessage(messageId);
    const sessionId = message?.chatSessionId ?? null;
    if (!sessionId) {
      res.status(404).json({ error: "Chat message not found" });
      return;
    }
    const actor = getActorInfo(req);
    const result = await chat.retryMessage({
      agentId: agent.id,
      sessionId,
      messageId,
      actor: {
        actorType: actor.actorType,
        actorId: actor.actorId,
      },
    });

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "chat.message.retried",
      entityType: "agent",
      entityId: agent.id,
      details: {
        chatSessionId: result.message.chatSessionId,
        chatMessageId: result.message.id,
        runId: result.runId,
      },
    });

    res.json(result);
  });

  router.get("/agents/:agentId/chat/messages/:messageId/stream", async (req, res) => {
    const agent = await resolveAgent(req, res);
    if (!agent) return;
    const messageId = req.params.messageId as string;
    const message = await chat.getMessage(messageId);
    const sessionId = message?.chatSessionId ?? null;
    if (!sessionId) {
      res.status(404).json({ error: "Chat message not found" });
      return;
    }
    let closed = false;
    req.on("close", () => {
      closed = true;
    });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    try {
      await chat.streamMessageResponse({
        agentId: agent.id,
        sessionId,
        messageId,
        isClosed: () => closed,
        onReady: ({ runId }) => writeSseEvent(res, "ready", { runId }),
        onLog: (chunk) => writeSseEvent(res, "log", chunk),
        onComplete: ({ runId, status, message: completedMessage }) =>
          writeSseEvent(res, "completed", {
            runId,
            status,
            message: completedMessage,
          }),
      });
    } catch (error) {
      writeSseEvent(res, "error", {
        error: error instanceof Error ? error.message : "Chat stream failed",
      });
    } finally {
      res.end();
    }
  });

  return router;
}
