import { describe, expect, it } from "vitest";
import type { Agent } from "@paperclipai/shared";
import {
  getSidebarVisibleAgents,
  groupAgentsByRoot,
  sortAgentsByHierarchy,
} from "./agents-sidebar-utils";

function makeAgent(overrides: Partial<Agent>): Agent {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: overrides.id ?? "agent-1",
    companyId: "company-1",
    name: overrides.name ?? "Agent",
    urlKey: overrides.urlKey ?? (overrides.name ?? "agent").toLowerCase(),
    role: overrides.role ?? "general",
    title: null,
    icon: null,
    status: overrides.status ?? "active",
    reportsTo: overrides.reportsTo ?? null,
    capabilities: null,
    adapterType: "opencode_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    permissions: { canCreateAgents: true },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("sortAgentsByHierarchy", () => {
  it("keeps roots first and places descendants after their root", () => {
    const root = makeAgent({ id: "root", name: "Root" });
    const report = makeAgent({ id: "report", name: "Report", reportsTo: "root" });
    const otherRoot = makeAgent({ id: "other", name: "Other" });

    const sorted = sortAgentsByHierarchy([report, otherRoot, root]);
    expect(sorted.map((agent) => agent.id)).toEqual(["other", "root", "report"]);
  });
});

describe("getSidebarVisibleAgents", () => {
  it("filters by needs-attention using unread counts and status", () => {
    const calm = makeAgent({ id: "calm", name: "Calm", status: "active" });
    const unread = makeAgent({ id: "unread", name: "Unread", status: "active" });
    const failing = makeAgent({ id: "failing", name: "Failing", status: "error" });

    const filtered = getSidebarVisibleAgents({
      agents: [calm, unread, failing],
      searchQuery: "",
      filter: "needs-attention",
      liveCountByAgent: new Map(),
      unreadByAgent: new Map([["unread", 2]]),
    });

    expect(filtered.map((agent) => agent.id)).toEqual(["unread", "failing"]);
  });

  it("filters by search query using name and role", () => {
    const engineer = makeAgent({ id: "eng", name: "Nexus", role: "engineer" });
    const marketer = makeAgent({ id: "mkt", name: "Corey", role: "cmo" });

    const filtered = getSidebarVisibleAgents({
      agents: [engineer, marketer],
      searchQuery: "engi",
      filter: "all",
      liveCountByAgent: new Map(),
      unreadByAgent: new Map(),
    });

    expect(filtered.map((agent) => agent.id)).toEqual(["eng"]);
  });
});

describe("groupAgentsByRoot", () => {
  it("groups agents under their top-level root", () => {
    const root = makeAgent({ id: "root", name: "Root" });
    const report = makeAgent({ id: "report", name: "Report", reportsTo: "root" });
    const solo = makeAgent({ id: "solo", name: "Solo" });

    const groups = groupAgentsByRoot([root, report, solo]);
    expect(groups.map((group) => group.label)).toEqual(["Root", "Solo"]);
    expect(groups[0]?.agents.map((agent) => agent.id)).toEqual(["root", "report"]);
  });
});
