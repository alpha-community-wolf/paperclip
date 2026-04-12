import { useMemo, useState } from "react";
import { NavLink, Link, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, PanelRightClose, PanelRightOpen, Plus, Search, Settings } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { useAgentsSidebar } from "../context/AgentsSidebarContext";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { chatApi } from "../api/chat";
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
import { useChatSidePanel } from "../context/ChatSidePanelContext";
import { useAgentOrder } from "../hooks/useAgentOrder";
import { Input } from "@/components/ui/input";
import {
  getSidebarVisibleAgents,
  groupAgentsByRoot,
  sortAgentsByHierarchy,
  type AgentsSidebarFilter,
} from "./agents-sidebar-utils";

/** Collapsed strip showing agent icon + status dot */
function CollapsedStrip({
  agents,
  liveCountByAgent,
  unreadByAgent,
  activeAgentId,
}: {
  agents: Agent[];
  liveCountByAgent: Map<string, number>;
  unreadByAgent: Map<string, number>;
  activeAgentId: string | null;
}) {
  const location = useLocation();

  return (
    <div className="flex flex-col items-center gap-1 py-2 w-full">
      {agents.map((agent) => {
        const isRunning = (liveCountByAgent.get(agent.id) ?? 0) > 0;
        const dotStatus = isRunning ? "running" : agent.status;
        const unread = unreadByAgent.get(agent.id) ?? 0;
        return (
          <Tooltip key={agent.id} delayDuration={200}>
            <TooltipTrigger asChild>
              <NavLink
                to={agentSwitchUrl(location.pathname, agent)}
                className={cn(
                  "relative flex items-center justify-center w-8 h-7 rounded-md transition-colors",
                  activeAgentId === agentRouteRef(agent)
                    ? "bg-accent text-foreground"
                    : "hover:bg-accent/50",
                )}
                aria-label={`${agent.name} - ${dotStatus}`}
              >
                <AgentIcon
                  icon={agent.icon}
                  className="h-4 w-4 text-muted-foreground"
                />
                <span className="absolute bottom-0.5 right-0.5">
                  <StatusDot status={dotStatus} size="sm" />
                </span>
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-none px-0.5">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              <p className="text-xs">
                {agent.name} — {dotStatus}
                {unread > 0 ? ` (${unread} unread)` : ""}
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
  unreadCount,
}: {
  agent: Agent;
  runCount: number;
  activity: import("../context/AgentActivityContext").AgentActivity | null;
  isActive: boolean;
  unreadCount: number;
}) {
  const location = useLocation();
  const { toggleChat, agentId: chatAgentId, isOpen: chatOpen } = useChatSidePanel();
  const isChatActive = chatOpen && chatAgentId === agent.id;

  return (
    <div className="group/row flex items-center rounded-md">
      <NavLink
        to={agentSwitchUrl(location.pathname, agent)}
        className={cn(
          "flex flex-1 items-center gap-2 px-3 py-1.5 text-[13px] font-medium transition-colors rounded-l-md min-w-0",
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
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {unreadCount > 0 && (
            <span className="flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          {runCount > 0 ? (
            <StatusDot status="running" size="sm" toolName={activity?.toolName} />
          ) : (
            !activity && <StatusDot status={agent.status} size="sm" />
          )}
        </span>
      </NavLink>
      <div className="flex items-center shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity pr-1">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleChat({
                  id: agent.id,
                  name: agent.name,
                  routeId: agentRouteRef(agent),
                  adapterType: agent.adapterType,
                });
              }}
              className={cn(
                "flex items-center justify-center h-6 w-6 rounded transition-colors",
                isChatActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50",
              )}
              aria-label={`Chat with ${agent.name}`}
            >
              <MessageCircle className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={4}>
            <p className="text-xs">Chat</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Link
              to={`/agents/${agentRouteRef(agent)}/configuration`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
              aria-label={`${agent.name} settings`}
            >
              <Settings className="h-3 w-3" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={4}>
            <p className="text-xs">Settings</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function AgentsSidebar() {
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialog();
  const { isMobile } = useSidebar();
  const { agentsSidebarOpen, toggleAgentsSidebar } = useAgentsSidebar();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<AgentsSidebarFilter>("all");

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;

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

  const { data: unreadSummary } = useQuery({
    queryKey: queryKeys.chatUnreadSummary(selectedCompanyId!),
    queryFn: () => chatApi.getUnreadSummary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    }
    return counts;
  }, [liveRuns]);

  const unreadByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of unreadSummary ?? []) {
      counts.set(entry.agentId, entry.unreadCount);
    }
    return counts;
  }, [unreadSummary]);

  const hierarchyAgents = useMemo(
    () => sortAgentsByHierarchy((agents ?? []).filter((agent: Agent) => agent.status !== "terminated")),
    [agents],
  );

  const { orderedAgents } = useAgentOrder({
    agents: hierarchyAgents,
    companyId: selectedCompanyId,
    userId: currentUserId,
  });

  const visibleAgents = useMemo(
    () => getSidebarVisibleAgents({
      agents: orderedAgents,
      searchQuery,
      filter,
      liveCountByAgent,
      unreadByAgent,
    }),
    [filter, liveCountByAgent, orderedAgents, searchQuery, unreadByAgent],
  );

  const groupedAgents = useMemo(() => groupAgentsByRoot(visibleAgents), [visibleAgents]);

  const agentActivity = useAgentActivity();

  const agentMatch = location.pathname.match(
    /^\/(?:[^/]+\/)?agents\/([^/]+)/,
  );
  const activeAgentId = agentMatch?.[1] ?? null;

  // On mobile, don't render the right sidebar at all
  if (isMobile) return null;

  // Collapsed state: icon strip with matching header for layout stability
  if (!agentsSidebarOpen) {
    return (
      <aside className="border-l border-border bg-background flex flex-col shrink-0 w-12">
        <div className="flex items-center justify-center h-12 shrink-0 border-b border-border">
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground shrink-0"
                onClick={toggleAgentsSidebar}
                aria-label="Expand agents panel"
              >
                <PanelRightOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={4}>
              <p>Expand agents</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <ScrollArea className="flex-1">
          <CollapsedStrip
            agents={visibleAgents}
            liveCountByAgent={liveCountByAgent}
            unreadByAgent={unreadByAgent}
            activeAgentId={activeAgentId}
          />
        </ScrollArea>
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

      <div className="border-b border-border px-2.5 py-2 space-y-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search agents"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          {([
            ["all", "All"],
            ["active", "Active"],
            ["needs-attention", "Needs"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "h-6 px-2 rounded-md text-[11px] font-medium transition-colors",
                filter === value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-2">
          {groupedAgents.map((group) => (
            <div key={group.key} className="space-y-1">
              <p className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground/60 truncate">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.agents.map((agent: Agent) => {
                  const runCount = liveCountByAgent.get(agent.id) ?? 0;
                  const activity = agentActivity.get(agent.id);
                  return (
                    <AgentRow
                      key={agent.id}
                      agent={agent}
                      runCount={runCount}
                      activity={activity ?? null}
                      isActive={activeAgentId === agentRouteRef(agent)}
                      unreadCount={unreadByAgent.get(agent.id) ?? 0}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {groupedAgents.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">No agents match your filters.</p>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
