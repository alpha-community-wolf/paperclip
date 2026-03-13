import { describe, expect, it } from "vitest";
import { computeSidebarInboxCount } from "../services/sidebar-badges.ts";

describe("computeSidebarInboxCount", () => {
  it("includes approvals, failed runs, joins, unread issues, and alerts", () => {
    expect(
      computeSidebarInboxCount({
        approvals: 2,
        failedRuns: 1,
        joinRequests: 3,
        unreadTouchedIssues: 4,
        alerts: 1,
      }),
    ).toBe(11);
  });
});

