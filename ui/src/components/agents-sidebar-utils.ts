import type { Agent } from "@paperclipai/shared";

export type AgentsSidebarFilter = "all" | "active" | "needs-attention";

export type AgentGroup = {
  key: string;
  label: string;
  agents: Agent[];
};

export function sortAgentsByHierarchy(agents: Agent[]): Agent[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const childrenOf = new Map<string | null, Agent[]>();

  for (const agent of agents) {
    const parentId = agent.reportsTo && byId.has(agent.reportsTo) ? agent.reportsTo : null;
    const children = childrenOf.get(parentId) ?? [];
    children.push(agent);
    childrenOf.set(parentId, children);
  }

  const roots = [...(childrenOf.get(null) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const queue = [...roots];
  const sorted: Agent[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    sorted.push(current);
    const children = [...(childrenOf.get(current.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    queue.push(...children);
  }

  return sorted;
}

function isNeedsAttention(agent: Agent, runCount: number, unreadCount: number): boolean {
  if (unreadCount > 0) return true;
  if (runCount > 0) return true;
  return agent.status === "error" || agent.status === "pending_approval";
}

function matchesFilter(
  agent: Agent,
  filter: AgentsSidebarFilter,
  runCount: number,
  unreadCount: number,
): boolean {
  if (filter === "all") return true;
  if (filter === "active") {
    return agent.status === "active" || agent.status === "running" || agent.status === "idle" || runCount > 0;
  }
  return isNeedsAttention(agent, runCount, unreadCount);
}

function matchesSearch(agent: Agent, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystack = `${agent.name} ${agent.role}`.toLowerCase();
  return haystack.includes(normalizedQuery);
}

export function getSidebarVisibleAgents({
  agents,
  searchQuery,
  filter,
  liveCountByAgent,
  unreadByAgent,
}: {
  agents: Agent[];
  searchQuery: string;
  filter: AgentsSidebarFilter;
  liveCountByAgent: Map<string, number>;
  unreadByAgent: Map<string, number>;
}): Agent[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return agents.filter((agent) => {
    if (agent.status === "terminated") return false;
    const runCount = liveCountByAgent.get(agent.id) ?? 0;
    const unreadCount = unreadByAgent.get(agent.id) ?? 0;
    return matchesFilter(agent, filter, runCount, unreadCount) && matchesSearch(agent, normalizedQuery);
  });
}

function findRootAgentId(agent: Agent, byId: Map<string, Agent>): string {
  let cursor: Agent | undefined = agent;
  let guard = 0;
  while (cursor?.reportsTo && byId.has(cursor.reportsTo) && guard < 100) {
    const next = byId.get(cursor.reportsTo);
    if (!next) break;
    cursor = next;
    guard += 1;
  }
  return cursor?.id ?? agent.id;
}

export function groupAgentsByRoot(agents: Agent[]): AgentGroup[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const grouped = new Map<string, Agent[]>();

  for (const agent of agents) {
    const rootId = findRootAgentId(agent, byId);
    const members = grouped.get(rootId) ?? [];
    members.push(agent);
    grouped.set(rootId, members);
  }

  return [...grouped.entries()]
    .map(([rootId, members]) => {
      const root = byId.get(rootId);
      return {
        key: rootId,
        label: root?.name ?? "Agents",
        agents: members,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
