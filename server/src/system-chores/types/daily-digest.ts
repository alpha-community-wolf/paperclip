import { issues, heartbeatRuns, agents } from "@paperclipai/db";
import { and, eq, gte, sql, count } from "drizzle-orm";
import type { SystemChoreTypeDefinition, SystemChoreContext, SystemChoreResult } from "../types.js";

export const dailyDigestChore: SystemChoreTypeDefinition = {
  key: "daily_digest",
  name: "Daily Activity Digest",
  description:
    "Compiles yesterday's activity: issues completed, agents active, and chores run. Returns a structured summary.",
  defaultExpression: "0 7 * * 1-5", // weekdays at 7 AM
  defaultTimezone: "UTC",
  defaultEnabled: true,

  async execute(ctx: SystemChoreContext): Promise<SystemChoreResult> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Issues completed yesterday
    const [completedResult] = await ctx.db
      .select({ count: count() })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, ctx.companyId),
          eq(issues.status, "done"),
          gte(issues.completedAt, yesterday),
        ),
      );
    const issuesCompleted = completedResult?.count ?? 0;

    // Issues created yesterday
    const [createdResult] = await ctx.db
      .select({ count: count() })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, ctx.companyId),
          gte(issues.createdAt, yesterday),
        ),
      );
    const issuesCreated = createdResult?.count ?? 0;

    // Heartbeat runs yesterday
    const [runsResult] = await ctx.db
      .select({ count: count() })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.companyId, ctx.companyId),
          gte(heartbeatRuns.createdAt, yesterday),
        ),
      );
    const totalRuns = runsResult?.count ?? 0;

    // Distinct active agents yesterday
    const activeAgentsResult = await ctx.db
      .selectDistinct({ agentId: heartbeatRuns.agentId })
      .from(heartbeatRuns)
      .where(
        and(
          eq(heartbeatRuns.companyId, ctx.companyId),
          gte(heartbeatRuns.createdAt, yesterday),
          sql`${heartbeatRuns.agentId} IS NOT NULL`,
        ),
      );
    const activeAgents = activeAgentsResult.length;

    const details = {
      period: { from: yesterday.toISOString(), to: today.toISOString() },
      issuesCompleted,
      issuesCreated,
      totalRuns,
      activeAgents,
    };

    const parts: string[] = [];
    parts.push(`${issuesCompleted} completed`);
    parts.push(`${issuesCreated} created`);
    parts.push(`${activeAgents} agents active`);
    parts.push(`${totalRuns} runs`);

    const summary = `Daily digest: ${parts.join(", ")}.`;

    return { summary, details };
  },
};
