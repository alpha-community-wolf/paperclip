import { heartbeatRuns } from "@paperclipai/db";
import { and, eq, lte, sql } from "drizzle-orm";
import type { SystemChoreTypeDefinition, SystemChoreContext, SystemChoreResult } from "../types.js";

export const runCleanupChore: SystemChoreTypeDefinition = {
  key: "run_cleanup",
  name: "Run History Cleanup",
  description:
    "Deletes old heartbeat run records to prevent table bloat. Configurable retention period.",
  defaultExpression: "0 4 * * 0", // Sundays at 4 AM
  defaultTimezone: "UTC",
  defaultEnabled: true,

  async execute(ctx: SystemChoreContext): Promise<SystemChoreResult> {
    const retentionDays = (ctx.config.retentionDays as number) ?? 30;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await ctx.db
      .delete(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.companyId, ctx.companyId),
          lte(heartbeatRuns.createdAt, cutoff),
        ),
      )
      .returning({ id: heartbeatRuns.id });

    const deleted = result.length;
    const details = { deleted, retentionDays, cutoff: cutoff.toISOString() };
    const summary =
      deleted > 0
        ? `Run cleanup: deleted ${deleted} run${deleted !== 1 ? "s" : ""} older than ${retentionDays} days.`
        : `Run cleanup: no old runs to delete.`;

    return { summary, details };
  },
};
