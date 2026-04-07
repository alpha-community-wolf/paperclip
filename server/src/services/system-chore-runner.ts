import type { Db } from "@paperclipai/db";
import { companies, heartbeatRuns, systemChoreConfigs } from "@paperclipai/db";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { CronExpressionParser } from "cron-parser";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { getAllSystemChoreTypes, getSystemChoreType } from "../system-chores/registry.js";
import { computeNextCronTrigger } from "./task-cron-schedules.js";

const MAX_CONSECUTIVE_FAILURES = 5;

export function systemChoreRunnerService(db: Db) {
  /**
   * Seed system chore config rows for all companies.
   * Called on startup — ensures every registered chore type has a config row per company.
   */
  async function seedAllCompanies(): Promise<{ seeded: number }> {
    const choreTypes = getAllSystemChoreTypes();
    if (choreTypes.length === 0) return { seeded: 0 };

    const allCompanies = await db.select({ id: companies.id }).from(companies);
    let seeded = 0;

    for (const company of allCompanies) {
      for (const choreType of choreTypes) {
        // Check if config already exists
        const existing = await db
          .select({ id: systemChoreConfigs.id })
          .from(systemChoreConfigs)
          .where(
            and(
              eq(systemChoreConfigs.companyId, company.id),
              eq(systemChoreConfigs.choreKey, choreType.key),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          const now = new Date();
          const nextRunAt = computeNextCronTrigger({
            expression: choreType.defaultExpression,
            timezone: choreType.defaultTimezone,
            from: now,
          });

          await db.insert(systemChoreConfigs).values({
            companyId: company.id,
            choreKey: choreType.key,
            enabled: choreType.defaultEnabled,
            expression: choreType.defaultExpression,
            timezone: choreType.defaultTimezone,
            nextRunAt,
          });
          seeded++;
        }
      }
    }

    return { seeded };
  }

  /**
   * Tick: find and execute all due system chores across all companies.
   * Called from the scheduler interval alongside tickDueSchedules().
   */
  async function tickSystemChores(now = new Date()): Promise<{ checked: number; executed: number; failed: number }> {
    const dueConfigs = await db
      .select()
      .from(systemChoreConfigs)
      .where(
        and(
          eq(systemChoreConfigs.enabled, true),
          or(
            lte(systemChoreConfigs.nextRunAt, now),
            isNull(systemChoreConfigs.nextRunAt),
          ),
        ),
      )
      .limit(50);

    let checked = dueConfigs.length;
    let executed = 0;
    let failed = 0;

    for (const config of dueConfigs) {
      try {
        await executeChore(config, now);
        executed++;
      } catch (err) {
        failed++;
        logger.error(
          { err, choreKey: config.choreKey, companyId: config.companyId },
          "system chore execution failed",
        );
      }
    }

    return { checked, executed, failed };
  }

  /**
   * Execute a single system chore for a company.
   */
  async function executeChore(
    config: typeof systemChoreConfigs.$inferSelect,
    now = new Date(),
  ): Promise<void> {
    const choreType = getSystemChoreType(config.choreKey);
    if (!choreType) {
      logger.warn({ choreKey: config.choreKey }, "unknown system chore key — skipping");
      return;
    }

    // Create a run record (raw SQL because agent_id is NULL for system chores
    // but the Drizzle schema keeps it notNull to avoid breaking all existing code)
    const [run] = (await db.execute(sql`
      INSERT INTO heartbeat_runs (company_id, agent_id, type, system_chore_key, invocation_source, trigger_detail, status, started_at)
      VALUES (${config.companyId}, NULL, 'system_chore', ${config.choreKey}, 'automation', 'system_chore', 'running', ${now.toISOString()}::timestamptz)
      RETURNING id
    `)) as unknown as { id: string }[];

    try {
      const result = await choreType.execute({
        companyId: config.companyId,
        choreKey: config.choreKey,
        config: (config.config as Record<string, unknown>) ?? {},
        db,
        runId: run.id,
      });

      // Mark run completed
      const finishedAt = new Date();
      await db
        .update(heartbeatRuns)
        .set({
          status: "completed",
          finishedAt,
          resultJson: { summary: result.summary, ...result.details },
          updatedAt: finishedAt,
        })
        .where(eq(heartbeatRuns.id, run.id));

      // Update config: reset failures, set next run
      const expression = config.expression ?? choreType.defaultExpression;
      const timezone = config.timezone ?? choreType.defaultTimezone;
      const nextRunAt = computeNextCronTrigger({ expression, timezone, from: now });

      await db
        .update(systemChoreConfigs)
        .set({
          lastRunAt: now,
          nextRunAt,
          consecutiveFailures: 0,
          lastError: null,
          updatedAt: finishedAt,
        })
        .where(eq(systemChoreConfigs.id, config.id));

      // Activity log
      await logActivity(db, {
        companyId: config.companyId,
        actorType: "system",
        actorId: `system_chore:${config.choreKey}`,
        action: "system_chore.completed",
        entityType: "system_chore",
        entityId: config.choreKey,
        runId: run.id,
        details: { summary: result.summary, ...result.details },
      });
    } catch (err) {
      // Mark run failed
      const finishedAt = new Date();
      const errorMessage = err instanceof Error ? err.message : String(err);

      await db
        .update(heartbeatRuns)
        .set({
          status: "failed",
          finishedAt,
          error: errorMessage,
          updatedAt: finishedAt,
        })
        .where(eq(heartbeatRuns.id, run.id));

      // Update config: increment failures, set next run
      const newFailures = (config.consecutiveFailures ?? 0) + 1;
      const shouldDisable = newFailures >= MAX_CONSECUTIVE_FAILURES;
      const expression = config.expression ?? choreType.defaultExpression;
      const timezone = config.timezone ?? choreType.defaultTimezone;
      const nextRunAt = computeNextCronTrigger({ expression, timezone, from: now });

      await db
        .update(systemChoreConfigs)
        .set({
          lastRunAt: now,
          nextRunAt: shouldDisable ? null : nextRunAt,
          consecutiveFailures: newFailures,
          lastError: errorMessage,
          enabled: shouldDisable ? false : config.enabled,
          updatedAt: finishedAt,
        })
        .where(eq(systemChoreConfigs.id, config.id));

      // Activity log for failure
      await logActivity(db, {
        companyId: config.companyId,
        actorType: "system",
        actorId: `system_chore:${config.choreKey}`,
        action: shouldDisable ? "system_chore.auto_disabled" : "system_chore.failed",
        entityType: "system_chore",
        entityId: config.choreKey,
        runId: run.id,
        details: {
          error: errorMessage,
          consecutiveFailures: newFailures,
          autoDisabled: shouldDisable,
        },
      });

      // Re-throw so tickSystemChores counts it
      throw err;
    }
  }

  /**
   * Manually trigger a system chore for a specific company.
   */
  async function triggerChore(companyId: string, choreKey: string): Promise<{ runId: string }> {
    const choreType = getSystemChoreType(choreKey);
    if (!choreType) {
      throw new Error(`Unknown system chore key: ${choreKey}`);
    }

    // Get or create config
    let [config] = await db
      .select()
      .from(systemChoreConfigs)
      .where(
        and(
          eq(systemChoreConfigs.companyId, companyId),
          eq(systemChoreConfigs.choreKey, choreKey),
        ),
      )
      .limit(1);

    if (!config) {
      // Auto-seed this chore for this company
      const now = new Date();
      [config] = await db
        .insert(systemChoreConfigs)
        .values({
          companyId,
          choreKey,
          enabled: choreType.defaultEnabled,
          expression: choreType.defaultExpression,
          timezone: choreType.defaultTimezone,
          nextRunAt: computeNextCronTrigger({
            expression: choreType.defaultExpression,
            timezone: choreType.defaultTimezone,
            from: now,
          }),
        })
        .returning();
    }

    await executeChore(config);

    // Return the most recent run for this chore
    const [latestRun] = await db
      .select({ id: heartbeatRuns.id })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.companyId, companyId),
          eq(heartbeatRuns.systemChoreKey, choreKey),
        ),
      )
      .orderBy(heartbeatRuns.createdAt)
      .limit(1);

    return { runId: latestRun?.id ?? "unknown" };
  }

  return {
    seedAllCompanies,
    tickSystemChores,
    triggerChore,
  };
}
