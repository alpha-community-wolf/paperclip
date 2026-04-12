import { issues } from "@paperclipai/db";
import { and, eq, isNull, lte } from "drizzle-orm";
import type { SystemChoreTypeDefinition, SystemChoreContext, SystemChoreResult } from "../types.js";

export const orphanIssueCleanupChore: SystemChoreTypeDefinition = {
  key: "orphan_issue_cleanup",
  name: "Orphan Issue Cleanup",
  description:
    "Finds unassigned issues stuck in todo for too long and logs them. Helps surface forgotten backlog items.",
  defaultExpression: "0 5 * * 1", // Mondays at 5 AM
  defaultTimezone: "UTC",
  defaultEnabled: true,

  async execute(ctx: SystemChoreContext): Promise<SystemChoreResult> {
    const staleDays = (ctx.config.staleDays as number) ?? 14;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - staleDays);

    const orphans = await ctx.db
      .select({
        id: issues.id,
        identifier: issues.identifier,
        title: issues.title,
        createdAt: issues.createdAt,
      })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, ctx.companyId),
          eq(issues.status, "todo"),
          isNull(issues.assigneeAgentId),
          isNull(issues.assigneeUserId),
          lte(issues.createdAt, cutoff),
        ),
      )
      .limit(100);

    const orphanList = orphans.map((o) => ({
      identifier: o.identifier,
      title: o.title,
      createdAt: o.createdAt.toISOString(),
    }));

    const details = { orphans: orphanList, staleDays, total: orphanList.length };
    const summary =
      orphanList.length > 0
        ? `Orphan issue cleanup: found ${orphanList.length} unassigned issue${orphanList.length !== 1 ? "s" : ""} older than ${staleDays} days.`
        : `Orphan issue cleanup: no orphan issues found.`;

    return { summary, details };
  },
};
