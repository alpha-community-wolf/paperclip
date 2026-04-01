import { useMemo } from "react";
import { NavLink, Link, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { PanelRightClose, Plus } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { useAgentsSidebar } from "../context/AgentsSidebarContext";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { cn, agentRouteRef, agentSwitchUrl } from "../lib/utils";
import { AgentIcon } from "./AgentIconPicker";
import { StatusDot } from "./StatusDot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Agent } from "@paperclipai/shared";
import {
  useAgentActivity,
  formatActivity,
  toolColor,
} from "../context/AgentActivityContext";

/** BFS sort: roots first (no reportsTo), then their direct reports, etc. */
function sortByHierarchy(agents: Agent[]): Agent[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const childrenOf = new Map<string | null, Agent[]>();
  for (const a of agents) {
    const parent = a.reportsTo && byId.has(a.reportsTo) ? a.reportsTo : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(a);
    childrenOf.set(parent, list);
  }
  const sorted: Agent[] = [];
  const queue = childrenOf.get(null) ?? [];
  while (queue.length > 0) {
    const agent = queue.shift()!;
    sorted.push(agent);
    const children = childrenOf.get(agent.id);
    if (children) queue.push(...children);
  }
  return sorted;
}

/** Collapsed strip showing agent icon + status dot */
function CollapsedStrip({
  agents,
  liveCountByAgent,
  onExpand,
}: {
  agents: Agent[];
  liveCountByAgent: Map<string, number>;
  onExpand: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-3 w-full">
      {agents.map((agent) => {
        const isRunning = (liveCountByAgent.get(agent.id) ?? 0) > 0;
        const dotStatus = isRunning ? "running" : agent.status;
        return (
          <Tooltip key={agent.id} delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onExpand}
                className="relative flex items-center justify-center w-8 h-7 rounded-md hover:bg-accent/50 transition-colors"
                aria-label={`${agent.name} — ${dotStatus}`}
              >
                <AgentIcon
                  icon={agent.icon}
                  className="h-4 w-4 text-muted-foreground"
                />
                <span className="absolute bottom-0.5 right-0.5">
                  <StatusDot status={dotStatus} size="sm" />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              <p className="text-xs">
                {agent.name} — {dotStatus}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Expanded agent row with details */
function AgentRow({
  agent,
  runCount,
  activity,
  isActive,
}: {
  agent: Agent;
  runCount: number;
  activity: import("../context/AgentActivityContext").AgentActivity | null;
  isActive: boolean;
}) {
  const location = useLocation();

  return (
    <NavLink
      to={agentSwitchUrl(location.pathname, agent)}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium transition-colors rounded-md",
        isActive
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <AgentIcon
        icon={agent.icon}
        className="shrink-0 h-3.5 w-3.5 text-muted-foreground"
      />
      <div className="flex-1 min-w-0">
        <span className="truncate block">{agent.name}</span>
        {activity && (
          <span
            className={cn(
              "text-[10px] truncate block animate-pulse",
              toolColor(activity.toolName),
            )}
          >
            {formatActivity(activity)}
          </span>
        )}
      </div>
      {runCount > 0 && !activity && (
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          <StatusDot status="running" size="sm" />
        </span>
      )}
      {runCount > 0 && activity && (
        <span className="ml-auto shrink-0">
          <StatusDot
            status="running"
            size="sm"
            toolName={activity.toolName}
          />
        </span>
      )}
      {runCount === 0 && !activity && (
        <span className="ml-auto shrink-0">
          <StatusDot status={agent.status} size="sm" />
        </span>
      )}
    </NavLink>
  );
}

export function AgentsSidebar() {
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialog();
  const { isMobile } = useSidebar();
  const { agentsSidebarOpen, toggleAgentsSidebar } = useAgentsSidebar();
  const location = useLocation();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    }
    return counts;
  }, [liveRuns]);

  const visibleAgents = useMemo(() => {
    const filtered = (agents ?? []).filter(
      (a: Agent) => a.status !== "terminated",
    );
    return sortByHierarchy(filtered);
  }, [agents]);

  const agentActivity = useAgentActivity();

  const agentMatch = location.pathname.match(
    /^\/(?:[^/]+\/)?agents\/([^/]+)/,
  );
  const activeAgentId = agentMatch?.[1] ?? null;

  // On mobile, don't render the right sidebar at all
  if (isMobile) return null;

  // Collapsed state: thin strip of status dots
  if (!agentsSidebarOpen) {
    return (
      <aside className="border-l border-border bg-background flex flex-col shrink-0 w-12">
        <CollapsedStrip
          agents={visibleAgents}
          liveCountByAgent={liveCountByAgent}
          onExpand={toggleAgentsSidebar}
        />
      </aside>
    );
  }

  // Expanded state: full agent list
  return (
    <aside className="border-l border-border bg-background flex flex-col shrink-0 w-56 overflow-hidden transition-[width] duration-100 ease-out">
      <div className="flex items-center gap-1 px-3 h-12 shrink-0 border-b border-border">
        <Link to="/agents" className="flex-1 min-w-0">
          <span
            className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 hover:text-foreground transition-colors"
            style={{ fontFamily: "var(--font-family-display)" }}
          >
            Agents
          </span>
        </Link>
        <button
          onClick={(e) => {
            e.stopPropagation();
            openNewAgent();
          }}
          className="flex items-center justify-center h-5 w-5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
          aria-label="New agent"
        >
          <Plus className="h-3 w-3" />
        </button>
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground shrink-0"
              onClick={toggleAgentsSidebar}
              aria-label="Collapse agents panel"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={4}>
            <p>Collapse agents</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {visibleAgents.map((agent: Agent) => {
            const runCount = liveCountByAgent.get(agent.id) ?? 0;
            const activity = agentActivity.get(agent.id);
            return (
              <AgentRow
                key={agent.id}
                agent={agent}
                runCount={runCount}
                activity={activity ?? null}
                isActive={activeAgentId === agentRouteRef(agent)}
              />
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
