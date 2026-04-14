import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentApiKeys, agents, companyMemberships, instanceUserRoles } from "@paperclipai/db";
import { verifyLocalAgentJwt } from "../agent-auth-jwt.js";
import { type DeploymentMode, isUuidLike } from "@paperclipai/shared";
import type { BetterAuthSessionResult } from "../auth/better-auth.js";
import { logger } from "./logger.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

interface ActorMiddlewareOptions {
  deploymentMode: DeploymentMode;
  resolveSession?: (req: Request) => Promise<BetterAuthSessionResult | null>;
}

export function actorMiddleware(db: Db, opts: ActorMiddlewareOptions): RequestHandler {
  return async (req, _res, next) => {
    req.actor =
      opts.deploymentMode === "local_trusted"
        ? { type: "board", userId: "local-board", isInstanceAdmin: true, source: "local_implicit" }
        : { type: "none", source: "none" };

    const runIdHeader = req.header("x-paperclip-run-id");

    const authHeader = req.header("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      if (opts.deploymentMode === "authenticated" && opts.resolveSession) {
        let session: BetterAuthSessionResult | null = null;
        try {
          session = await opts.resolveSession(req);
        } catch (err) {
          logger.warn(
            { err, method: req.method, url: req.originalUrl },
            "Failed to resolve auth session from request headers",
          );
        }
        if (session?.user?.id) {
          const userId = session.user.id;
          const [roleRow, memberships] = await Promise.all([
            db
              .select({ id: instanceUserRoles.id })
              .from(instanceUserRoles)
              .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
              .then((rows) => rows[0] ?? null),
            db
              .select({ companyId: companyMemberships.companyId })
              .from(companyMemberships)
              .where(
                and(
                  eq(companyMemberships.principalType, "user"),
                  eq(companyMemberships.principalId, userId),
                  eq(companyMemberships.status, "active"),
                ),
              ),
          ]);
          req.actor = {
            type: "board",
            userId,
            companyIds: memberships.map((row) => row.companyId),
            isInstanceAdmin: Boolean(roleRow),
            runId: runIdHeader ?? undefined,
            source: "session",
          };
          next();
          return;
        }
      }
      if (runIdHeader) req.actor.runId = runIdHeader;
      next();
      return;
    }

    const token = authHeader.slice("bearer ".length).trim();
    if (!token) {
      next();
      return;
    }

    const tokenHash = hashToken(token);
    const key = await db
      .select()
      .from(agentApiKeys)
      .where(and(eq(agentApiKeys.keyHash, tokenHash), isNull(agentApiKeys.revokedAt)))
      .then((rows) => rows[0] ?? null);

    if (!key) {
      const claims = verifyLocalAgentJwt(token);
      if (!claims) {
        next();
        return;
      }

      // Telegram Mini App: `sub` is the Better Auth user id, not an agent row id (see telegramService.miniAppAuth).
      if (claims.adapter_type === "mini-app") {
        const userId = claims.sub;
        const [roleRow, memberships] = await Promise.all([
          db
            .select({ id: instanceUserRoles.id })
            .from(instanceUserRoles)
            .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
            .then((rows) => rows[0] ?? null),
          db
            .select({ companyId: companyMemberships.companyId })
            .from(companyMemberships)
            .where(
              and(
                eq(companyMemberships.principalType, "user"),
                eq(companyMemberships.principalId, userId),
                eq(companyMemberships.status, "active"),
              ),
            ),
        ]);
        let companyIds = memberships.map((row) => row.companyId);
        if (!companyIds.includes(claims.company_id)) {
          companyIds = [...companyIds, claims.company_id];
        }
        // JWT run_id is a non-UUID placeholder (e.g. mini-app-<ts>); activity_log.run_id is uuid + FK to heartbeat_runs.
        const headerRunId = runIdHeader?.trim();
        req.actor = {
          type: "board",
          userId,
          companyIds,
          isInstanceAdmin: Boolean(roleRow),
          runId: headerRunId && isUuidLike(headerRunId) ? headerRunId : undefined,
          source: "mini_app_jwt",
        };
        next();
        return;
      }

      const agentRecord = await db
        .select()
        .from(agents)
        .where(eq(agents.id, claims.sub))
        .then((rows) => rows[0] ?? null);

      if (!agentRecord || agentRecord.companyId !== claims.company_id) {
        next();
        return;
      }

      if (agentRecord.status === "terminated" || agentRecord.status === "pending_approval") {
        next();
        return;
      }

      req.actor = {
        type: "agent",
        agentId: claims.sub,
        companyId: claims.company_id,
        keyId: undefined,
        runId: runIdHeader || claims.run_id || undefined,
        source: "agent_jwt",
      };
      next();
      return;
    }

    await db
      .update(agentApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(agentApiKeys.id, key.id));

    const agentRecord = await db
      .select()
      .from(agents)
      .where(eq(agents.id, key.agentId))
      .then((rows) => rows[0] ?? null);

    if (!agentRecord || agentRecord.status === "terminated" || agentRecord.status === "pending_approval") {
      next();
      return;
    }

    req.actor = {
      type: "agent",
      agentId: key.agentId,
      companyId: key.companyId,
      keyId: key.id,
      runId: runIdHeader || undefined,
      source: "agent_key",
    };

    next();
  };
}

export function requireBoard(req: Express.Request) {
  return req.actor.type === "board";
}
