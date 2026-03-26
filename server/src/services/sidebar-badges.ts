import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, approvals, heartbeatRuns } from "@paperclipai/db";
import type { SidebarBadges } from "@paperclipai/shared";

const ACTIONABLE_APPROVAL_STATUSES = ["pending", "revision_requested"];
const FAILED_HEARTBEAT_STATUSES = ["failed", "timed_out"];

export function computeSidebarInboxCount(input: {
  approvals: number;
  failedRuns: number;
  joinRequests: number;
  unreadTouchedIssues: number;
  alerts: number;
}) {
  return (
    input.approvals +
    input.failedRuns +
    input.joinRequests +
    input.unreadTouchedIssues +
    input.alerts
  );
}

export function sidebarBadgeService(db: Db) {
  return {
    get: async (
      companyId: string,
      extra?: {
        joinRequests?: number;
        unreadTouchedIssues?: number;
        alerts?: number;
        dismissedFailedRunIds?: string[];
        unreadChatSessions?: number;
        unreadChatByAgent?: Record<string, number>;
      },
    ): Promise<SidebarBadges> => {
      const actionableApprovals = await db
        .select({ count: sql<number>`count(*)` })
        .from(approvals)
        .where(
          and(
            eq(approvals.companyId, companyId),
            inArray(approvals.status, ACTIONABLE_APPROVAL_STATUSES),
          ),
        )
        .then((rows) => Number(rows[0]?.count ?? 0));

      const latestRunByAgent = await db
        .selectDistinctOn([heartbeatRuns.agentId], {
          runId: heartbeatRuns.id,
          runStatus: heartbeatRuns.status,
        })
        .from(heartbeatRuns)
        .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            eq(agents.companyId, companyId),
            not(eq(agents.status, "terminated")),
          ),
        )
        .orderBy(heartbeatRuns.agentId, desc(heartbeatRuns.createdAt));

      const dismissedFailedRunIdSet = new Set(extra?.dismissedFailedRunIds ?? []);
      const failedRuns = latestRunByAgent.filter((row) => {
        if (!FAILED_HEARTBEAT_STATUSES.includes(row.runStatus)) return false;
        return !dismissedFailedRunIdSet.has(row.runId);
      }).length;

      const joinRequests = extra?.joinRequests ?? 0;
      const unreadTouchedIssues = extra?.unreadTouchedIssues ?? 0;
      const alerts = extra?.alerts ?? 0;
      const unreadChatSessions = extra?.unreadChatSessions ?? 0;
      return {
        inbox: computeSidebarInboxCount({
          approvals: actionableApprovals,
          failedRuns,
          joinRequests,
          unreadTouchedIssues,
          alerts,
        }),
        approvals: actionableApprovals,
        failedRuns,
        joinRequests,
        unreadTouchedIssues,
        alerts,
        unreadChatSessions,
        unreadChatByAgent: extra?.unreadChatByAgent ?? {},
      };
    },
  };
}
