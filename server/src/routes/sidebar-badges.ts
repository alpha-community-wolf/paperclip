import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { and, eq, sql } from "drizzle-orm";
import { joinRequests } from "@paperclipai/db";
import { computeSidebarInboxCount, sidebarBadgeService } from "../services/sidebar-badges.js";
import { inboxDismissalService } from "../services/inbox-dismissals.js";
import { accessService } from "../services/access.js";
import { dashboardService } from "../services/dashboard.js";
import { issueService } from "../services/issues.js";
import { assertCompanyAccess } from "./authz.js";

export function sidebarBadgeRoutes(db: Db) {
  const router = Router();
  const svc = sidebarBadgeService(db);
  const access = accessService(db);
  const inboxDismissals = inboxDismissalService(db);
  const dashboard = dashboardService(db);
  const issues = issueService(db);
  const INBOX_ISSUE_STATUSES = "backlog,todo,in_progress,in_review,blocked,done";

  router.get("/companies/:companyId/sidebar-badges", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    let canApproveJoins = false;
    if (req.actor.type === "board") {
      canApproveJoins =
        req.actor.source === "local_implicit" ||
        Boolean(req.actor.isInstanceAdmin) ||
        (await access.canUser(companyId, req.actor.userId, "joins:approve"));
    } else if (req.actor.type === "agent" && req.actor.agentId) {
      canApproveJoins = await access.hasPermission(companyId, "agent", req.actor.agentId, "joins:approve");
    }

    const joinRequestCount = canApproveJoins
      ? await db
        .select({ count: sql<number>`count(*)` })
        .from(joinRequests)
        .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.status, "pending_approval")))
        .then((rows) => Number(rows[0]?.count ?? 0))
      : 0;

    const unreadTouchedIssues =
      req.actor.type === "board" && typeof req.actor.userId === "string"
        ? await issues.countUnreadTouchedByUser(companyId, req.actor.userId, INBOX_ISSUE_STATUSES)
        : 0;

    const dismissedFailedRunIds =
      req.actor.type === "board" && typeof req.actor.userId === "string"
        ? await inboxDismissals.listItemIdsByType(companyId, req.actor.userId, "failed_run")
        : [];

    const badges = await svc.get(companyId, {
      joinRequests: joinRequestCount,
      unreadTouchedIssues,
      dismissedFailedRunIds,
    });

    const summary = await dashboard.summary(companyId);
    const hasFailedRuns = badges.failedRuns > 0;
    const alertsCount =
      (summary.agents.error > 0 && !hasFailedRuns ? 1 : 0) +
      (summary.costs.monthBudgetCents > 0 && summary.costs.monthUtilizationPercent >= 80 ? 1 : 0);
    badges.alerts = alertsCount;
    badges.inbox = computeSidebarInboxCount({
      approvals: badges.approvals,
      failedRuns: badges.failedRuns,
      joinRequests: badges.joinRequests,
      unreadTouchedIssues: badges.unreadTouchedIssues,
      alerts: alertsCount,
    });

    res.json(badges);
  });

  return router;
}
