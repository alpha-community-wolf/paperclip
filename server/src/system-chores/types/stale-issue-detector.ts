import { issues, issueComments } from "@paperclipai/db";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { SystemChoreTypeDefinition, SystemChoreContext, SystemChoreResult } from "../types.js";

export const staleIssueDetectorChore: SystemChoreTypeDefinition = {
  key: "stale_issue_detector",
  name: "Stale Issue Detector",
  description:
    "Finds issues stuck in in_progress or blocked for too long and posts a warning comment on each. Helps surface forgotten work.",
  defaultExpression: "0 8 * * 1-5", // weekdays at 8 AM
  defaultTimezone: "UTC",
  defaultEnabled: true,

  async execute(ctx: SystemChoreContext): Promise<SystemChoreResult> {
    const staleDays = (ctx.config.staleDays as number) ?? 7;
    const statuses = (ctx.config.statuses as string[]) ?? ["in_progress", "blocked"];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - staleDays);

    const staleIssues = await ctx.db
      .select({
        id: issues.id,
        identifier: issues.identifier,
        title: issues.title,
        status: issues.status,
        updatedAt: issues.updatedAt,
      })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, ctx.companyId),
          inArray(issues.status, statuses),
          lte(issues.updatedAt, cutoff),
        ),
      )
      .limit(50);

    let warned = 0;
    for (const issue of staleIssues) {
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(issue.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
      );

      await ctx.db.insert(issueComments).values({
        issueId: issue.id,
        companyId: ctx.companyId,
        body: `⚠️ **Stale issue detected** — this issue has been in \`${issue.status}\` for ${daysSinceUpdate} days without updates. Please review and update or reassign.`,
      });
      warned++;
    }

    const details = { warned, staleDays, statuses, cutoff: cutoff.toISOString() };
    const summary =
      warned > 0
        ? `Stale issue detector: warned ${warned} issue${warned !== 1 ? "s" : ""} (>${staleDays} days stale).`
        : `Stale issue detector: no stale issues found.`;

    return { summary, details };
  },
};
