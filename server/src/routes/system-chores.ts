import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { agents, systemChoreConfigs, heartbeatRuns } from "@paperclipai/db";
import { and, desc, eq, isNull, count } from "drizzle-orm";
import { CronExpressionParser } from "cron-parser";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { getAllSystemChoreTypes, getSystemChoreType } from "../system-chores/registry.js";
import { systemChoreRunnerService } from "../services/system-chore-runner.js";
import { logActivity } from "../services/activity-log.js";
import { computeNextCronTrigger } from "../services/task-cron-schedules.js";

const MAX_CUSTOM_CHORES_PER_COMPANY = 20;

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  expression: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  model: z.string().min(1).optional().nullable(),
  config: z.record(z.unknown()).optional(),
  // Custom chore fields
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  agentId: z.string().uuid().optional(),
  issueTemplate: z
    .object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      projectId: z.string().uuid().optional().nullable(),
    })
    .optional(),
});

const createCustomChoreSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  expression: z.string().min(1),
  timezone: z.string().min(1).optional(),
  agentId: z.string().uuid(),
  issueTemplate: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    projectId: z.string().uuid().optional().nullable(),
  }),
});

function validateCronExpression(expression: string): boolean {
  try {
    CronExpressionParser.parse(expression);
    return true;
  } catch {
    return false;
  }
}

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
      .where(
        and(
          eq(systemChoreConfigs.companyId, companyId),
          isNull(systemChoreConfigs.deletedAt),
        ),
      );

    const configMap = new Map(configs.map((c) => [c.choreKey, c]));

    // Built-in chores
    const builtIn = choreTypes.map((ct) => {
      const cfg = configMap.get(ct.key);
      return {
        key: ct.key,
        name: ct.name,
        description: ct.description,
        choreType: "built_in" as const,
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

    // Custom chores
    const customConfigs = configs.filter((c) => c.choreType === "custom");
    const custom = customConfigs.map((cfg) => ({
      key: cfg.choreKey,
      name: cfg.displayName ?? cfg.choreKey,
      description: cfg.displayDescription ?? "",
      choreType: "custom" as const,
      defaults: {
        expression: cfg.expression ?? "0 9 * * *",
        timezone: cfg.timezone ?? "UTC",
        enabled: true,
      },
      config: {
        id: cfg.id,
        enabled: cfg.enabled,
        expression: cfg.expression ?? "0 9 * * *",
        timezone: cfg.timezone ?? "UTC",
        model: cfg.model,
        config: cfg.config,
        lastRunAt: cfg.lastRunAt,
        nextRunAt: cfg.nextRunAt,
        consecutiveFailures: cfg.consecutiveFailures,
        lastError: cfg.lastError,
      },
    }));

    res.json([...builtIn, ...custom]);
  });

  // POST /companies/:companyId/system-chores — create a custom chore
  router.post(
    "/companies/:companyId/system-chores",
    validate(createCustomChoreSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertBoard(req);

      // Validate cron expression
      if (!validateCronExpression(req.body.expression)) {
        res.status(400).json({ error: "Invalid cron expression" });
        return;
      }

      // Check custom chore limit
      const [countResult] = await db
        .select({ count: count() })
        .from(systemChoreConfigs)
        .where(
          and(
            eq(systemChoreConfigs.companyId, companyId),
            eq(systemChoreConfigs.choreType, "custom"),
            isNull(systemChoreConfigs.deletedAt),
          ),
        );

      if ((countResult?.count ?? 0) >= MAX_CUSTOM_CHORES_PER_COMPANY) {
        res.status(400).json({
          error: `Maximum of ${MAX_CUSTOM_CHORES_PER_COMPANY} custom chores per company`,
        });
        return;
      }

      // Validate agent belongs to company
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.id, req.body.agentId),
            eq(agents.companyId, companyId),
          ),
        )
        .limit(1);

      if (!agent) {
        res.status(400).json({ error: "Agent not found in this company" });
        return;
      }

      const choreKey = `custom_${randomUUID().split("-")[0]}`;
      const timezone = req.body.timezone ?? "UTC";
      const now = new Date();
      const nextRunAt = computeNextCronTrigger({
        expression: req.body.expression,
        timezone,
        from: now,
      });

      const [created] = await db
        .insert(systemChoreConfigs)
        .values({
          companyId,
          choreKey,
          choreType: "custom",
          enabled: true,
          expression: req.body.expression,
          timezone,
          displayName: req.body.name,
          displayDescription: req.body.description ?? null,
          config: {
            agentId: req.body.agentId,
            issueTemplate: req.body.issueTemplate,
          },
          createdByUserId: (req as any).userId ?? null,
          nextRunAt,
        })
        .returning();

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "system_chore.created",
        entityType: "system_chore",
        entityId: choreKey,
        details: { name: req.body.name, choreKey },
      });

      res.status(201).json(created);
    },
  );

  // PATCH /companies/:companyId/system-chores/:choreKey — update config
  router.patch(
    "/companies/:companyId/system-chores/:choreKey",
    validate(updateConfigSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const choreKey = req.params.choreKey as string;
      assertBoard(req);

      const [existing] = await db
        .select()
        .from(systemChoreConfigs)
        .where(
          and(
            eq(systemChoreConfigs.companyId, companyId),
            eq(systemChoreConfigs.choreKey, choreKey),
            isNull(systemChoreConfigs.deletedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        // For built-in chores, check if the type exists
        const choreType = getSystemChoreType(choreKey);
        if (!choreType) {
          res.status(404).json({ error: `Unknown system chore key: ${choreKey}` });
          return;
        }
        res.status(404).json({ error: "System chore config not found. Run seed first." });
        return;
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
      if (req.body.expression !== undefined) {
        if (!validateCronExpression(req.body.expression)) {
          res.status(400).json({ error: "Invalid cron expression" });
          return;
        }
        updates.expression = req.body.expression;
      }
      if (req.body.timezone !== undefined) updates.timezone = req.body.timezone;
      if (req.body.model !== undefined) updates.model = req.body.model;
      if (req.body.config !== undefined) updates.config = req.body.config;

      // Custom chore-specific fields
      if (existing.choreType === "custom") {
        if (req.body.name !== undefined) updates.displayName = req.body.name;
        if (req.body.description !== undefined) updates.displayDescription = req.body.description;
        if (req.body.agentId !== undefined || req.body.issueTemplate !== undefined) {
          const existingConfig = (existing.config as Record<string, unknown>) ?? {};
          const newConfig = { ...existingConfig };
          if (req.body.agentId !== undefined) newConfig.agentId = req.body.agentId;
          if (req.body.issueTemplate !== undefined) newConfig.issueTemplate = req.body.issueTemplate;
          updates.config = newConfig;
        }
      }

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

  // DELETE /companies/:companyId/system-chores/:choreKey — soft-delete a custom chore
  router.delete("/companies/:companyId/system-chores/:choreKey", async (req, res) => {
    const companyId = req.params.companyId as string;
    const choreKey = req.params.choreKey as string;
    assertBoard(req);

    const [existing] = await db
      .select()
      .from(systemChoreConfigs)
      .where(
        and(
          eq(systemChoreConfigs.companyId, companyId),
          eq(systemChoreConfigs.choreKey, choreKey),
          eq(systemChoreConfigs.choreType, "custom"),
          isNull(systemChoreConfigs.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Custom chore not found" });
      return;
    }

    await db
      .update(systemChoreConfigs)
      .set({
        deletedAt: new Date(),
        enabled: false,
        nextRunAt: null,
        updatedAt: new Date(),
      })
      .where(eq(systemChoreConfigs.id, existing.id));

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "system_chore.deleted",
      entityType: "system_chore",
      entityId: choreKey,
      details: { name: existing.displayName },
    });

    res.json({ ok: true });
  });

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
