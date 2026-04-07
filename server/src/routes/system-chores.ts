import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { systemChoreConfigs, heartbeatRuns } from "@paperclipai/db";
import { and, desc, eq } from "drizzle-orm";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { getAllSystemChoreTypes, getSystemChoreType } from "../system-chores/registry.js";
import { systemChoreRunnerService } from "../services/system-chore-runner.js";
import { logActivity } from "../services/activity-log.js";

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  expression: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  model: z.string().min(1).optional().nullable(),
  config: z.record(z.unknown()).optional(),
});

export function systemChoreRoutes(db: Db) {
  const router = Router();
  const runner = systemChoreRunnerService(db);

  // GET /companies/:companyId/system-chores — list all system chore types with their configs
  router.get("/companies/:companyId/system-chores", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const choreTypes = getAllSystemChoreTypes();
    const configs = await db
      .select()
      .from(systemChoreConfigs)
      .where(eq(systemChoreConfigs.companyId, companyId));

    const configMap = new Map(configs.map((c) => [c.choreKey, c]));

    const result = choreTypes.map((ct) => {
      const cfg = configMap.get(ct.key);
      return {
        key: ct.key,
        name: ct.name,
        description: ct.description,
        defaults: {
          expression: ct.defaultExpression,
          timezone: ct.defaultTimezone,
          enabled: ct.defaultEnabled,
        },
        config: cfg
          ? {
              id: cfg.id,
              enabled: cfg.enabled,
              expression: cfg.expression ?? ct.defaultExpression,
              timezone: cfg.timezone ?? ct.defaultTimezone,
              model: cfg.model,
              config: cfg.config,
              lastRunAt: cfg.lastRunAt,
              nextRunAt: cfg.nextRunAt,
              consecutiveFailures: cfg.consecutiveFailures,
              lastError: cfg.lastError,
            }
          : null,
      };
    });

    res.json(result);
  });

  // PATCH /companies/:companyId/system-chores/:choreKey — update config
  router.patch(
    "/companies/:companyId/system-chores/:choreKey",
    validate(updateConfigSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const choreKey = req.params.choreKey as string;
      assertBoard(req);

      const choreType = getSystemChoreType(choreKey);
      if (!choreType) {
        res.status(404).json({ error: `Unknown system chore key: ${choreKey}` });
        return;
      }

      const [existing] = await db
        .select()
        .from(systemChoreConfigs)
        .where(
          and(eq(systemChoreConfigs.companyId, companyId), eq(systemChoreConfigs.choreKey, choreKey)),
        )
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "System chore config not found. Run seed first." });
        return;
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
      if (req.body.expression !== undefined) updates.expression = req.body.expression;
      if (req.body.timezone !== undefined) updates.timezone = req.body.timezone;
      if (req.body.model !== undefined) updates.model = req.body.model;
      if (req.body.config !== undefined) updates.config = req.body.config;

      // If re-enabling, reset consecutive failures
      if (req.body.enabled === true && !existing.enabled) {
        updates.consecutiveFailures = 0;
        updates.lastError = null;
      }

      const [updated] = await db
        .update(systemChoreConfigs)
        .set(updates)
        .where(eq(systemChoreConfigs.id, existing.id))
        .returning();

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "system_chore.config_updated",
        entityType: "system_chore",
        entityId: choreKey,
        details: req.body,
      });

      res.json(updated);
    },
  );

  // POST /companies/:companyId/system-chores/:choreKey/trigger — trigger manually
  router.post("/companies/:companyId/system-chores/:choreKey/trigger", async (req, res) => {
    const companyId = req.params.companyId as string;
    const choreKey = req.params.choreKey as string;
    assertBoard(req);

    try {
      const result = await runner.triggerChore(companyId, choreKey);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  // GET /companies/:companyId/system-chore-runs — list runs for system chores
  router.get("/companies/:companyId/system-chore-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const choreKey = req.query.choreKey as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const conditions = [
      eq(heartbeatRuns.companyId, companyId),
      eq(heartbeatRuns.type, "system_chore"),
    ];
    if (choreKey) {
      conditions.push(eq(heartbeatRuns.systemChoreKey, choreKey));
    }

    const runs = await db
      .select({
        id: heartbeatRuns.id,
        systemChoreKey: heartbeatRuns.systemChoreKey,
        status: heartbeatRuns.status,
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
        error: heartbeatRuns.error,
        resultJson: heartbeatRuns.resultJson,
        createdAt: heartbeatRuns.createdAt,
      })
      .from(heartbeatRuns)
      .where(and(...conditions))
      .orderBy(desc(heartbeatRuns.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(runs);
  });

  return router;
}
