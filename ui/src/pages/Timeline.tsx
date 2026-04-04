import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  CalendarClock,
  Filter,
  ExternalLink,
} from "lucide-react";
import { timelineApi, type TimelineEvent } from "../api/timeline";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { Link, useSearchParams } from "../lib/router";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Agent } from "@paperclipai/shared";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Deterministic agent colors — hue derived from agent ID
const AGENT_HUES = [45, 160, 220, 280, 340, 25, 120, 200, 310, 70];

function agentHue(agentId: string, index: number): number {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  }
  return AGENT_HUES[Math.abs(hash) % AGENT_HUES.length] ?? (index * 37) % 360;
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDayHeader(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Get the Monday of the week containing `date` */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Build the 6-row calendar grid for a given month */
function buildCalendarDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const start = startOfWeek(firstOfMonth);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

// --- URL search param helpers ---
function readArrayParam(searchParams: URLSearchParams, key: string): string[] {
  const value = searchParams.get(key);
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

function writeFiltersToUrl(agents: string[], types: string[]) {
  const url = new URL(window.location.href);
  if (agents.length > 0) {
    url.searchParams.set("agents", agents.join(","));
  } else {
    url.searchParams.delete("agents");
  }
  if (types.length > 0 && types.length < 2) {
    url.searchParams.set("types", types.join(","));
  } else {
    url.searchParams.delete("types");
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

// --- Day Detail Sheet ---
interface DayDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  events: TimelineEvent[];
  agentColorMap: Map<string, number>;
  agentMap: Map<string, Agent>;
}

function DayDetailSheet({
  open,
  onOpenChange,
  date,
  events,
  agentColorMap,
  agentMap,
}: DayDetailSheetProps) {
  if (!date) return null;

  const heartbeats = events.filter((e) => e.type === "heartbeat");
  const schedules = events.filter((e) => e.type === "scheduled_issue");

  // Group heartbeats by agent for cleaner display
  const heartbeatsByAgent = new Map<string, TimelineEvent[]>();
  for (const hb of heartbeats) {
    const list = heartbeatsByAgent.get(hb.agentId) ?? [];
    list.push(hb);
    heartbeatsByAgent.set(hb.agentId, list);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            {formatDayHeader(date)}
          </SheetTitle>
          <SheetDescription>
            {schedules.length} scheduled event{schedules.length !== 1 ? "s" : ""}
            {" · "}
            {heartbeats.length} heartbeat{heartbeats.length !== 1 ? "s" : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-4">
          {/* Scheduled events */}
          {schedules.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CalendarClock className="h-3 w-3" />
                Scheduled Events
              </h4>
              <div className="space-y-1.5">
                {schedules.map((evt, i) => {
                  const hue = agentColorMap.get(evt.agentId) ?? 45;
                  const agent = agentMap.get(evt.agentId);
                  const time = new Date(evt.scheduledAt).toLocaleTimeString(
                    "en-US",
                    { hour: "numeric", minute: "2-digit", hour12: true },
                  );
                  return (
                    <div
                      key={`${evt.scheduleId}-${i}`}
                      className="rounded-md border border-border/60 p-2.5 space-y-1.5"
                      style={{
                        borderLeft: `3px solid oklch(0.6 0.15 ${hue})`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">
                          {evt.scheduleName ?? "Schedule"}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {time}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {/* Agent link */}
                        {agent && (
                          <Link
                            to={`/agents/${agent.id}`}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            <AgentIcon
                              icon={agent.icon}
                              className="h-3 w-3"
                            />
                            {agent.name}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}

                        {/* Schedule link */}
                        {evt.scheduleId && (
                          <Link
                            to="/schedules"
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            <CalendarClock className="h-3 w-3" />
                            Schedule
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}

                        {/* Issue link */}
                        {evt.issueId && (
                          <Link
                            to={`/issues/${evt.issueId}`}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            Issue
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </div>

                      {/* Metadata row */}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 font-mono">
                        {evt.cronExpression && (
                          <span>{evt.cronExpression}</span>
                        )}
                        {evt.issueMode && (
                          <span className="border border-border/50 rounded px-1">
                            {evt.issueMode}
                          </span>
                        )}
                        {evt.timezone && evt.timezone !== "UTC" && (
                          <span>{evt.timezone}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Heartbeats by agent */}
          {heartbeatsByAgent.size > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Heartbeats
              </h4>
              <div className="space-y-1.5">
                {[...heartbeatsByAgent.entries()].map(([agentId, hbs]) => {
                  const agent = agentMap.get(agentId);
                  const hue = agentColorMap.get(agentId) ?? 45;
                  const interval = hbs[0]?.intervalSec;
                  return (
                    <div
                      key={agentId}
                      className="rounded-md border border-border/60 p-2.5 space-y-1"
                      style={{
                        borderLeft: `3px solid oklch(0.6 0.15 ${hue})`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        {agent ? (
                          <Link
                            to={`/agents/${agent.id}`}
                            className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground transition-colors"
                          >
                            <AgentIcon
                              icon={agent.icon}
                              className="h-3.5 w-3.5"
                            />
                            {agent.name}
                            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                          </Link>
                        ) : (
                          <span className="text-sm font-medium">
                            Unknown agent
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {hbs.length} beat{hbs.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {interval && (
                          <span>
                            Every{" "}
                            {interval >= 3600
                              ? `${Math.round(interval / 3600)}h`
                              : `${Math.round(interval / 60)}m`}
                          </span>
                        )}
                        {" · "}
                        {hbs
                          .slice(0, 6)
                          .map((hb) =>
                            new Date(hb.scheduledAt).toLocaleTimeString(
                              "en-US",
                              {
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                              },
                            ),
                          )
                          .join(", ")}
                        {hbs.length > 6 && ` +${hbs.length - 6} more`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {schedules.length === 0 && heartbeats.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">
              No events on this day.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- Day Cell ---
interface DayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  heartbeatCount: number;
  scheduleEvents: TimelineEvent[];
  agentColorMap: Map<string, number>;
  agentMap: Map<string, Agent>;
  onClick: (date: Date) => void;
}

function DayCell({
  date,
  isCurrentMonth,
  isToday,
  heartbeatCount,
  scheduleEvents,
  agentColorMap,
  agentMap,
  onClick,
}: DayCellProps) {
  const visible = scheduleEvents.slice(0, 3);
  const overflow = scheduleEvents.length - 3;
  const hasEvents = heartbeatCount > 0 || scheduleEvents.length > 0;

  return (
    <div
      className={`min-h-[90px] border-b border-r border-border/50 px-1.5 py-1 transition-colors ${
        isCurrentMonth ? "bg-background" : "bg-muted/10"
      } ${isToday ? "ring-1 ring-inset ring-primary/30" : ""} ${
        hasEvents ? "cursor-pointer hover:bg-muted/20" : ""
      }`}
      onClick={hasEvents ? () => onClick(date) : undefined}
    >
      {/* Date number */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className={`inline-flex items-center justify-center text-xs font-medium leading-none ${
            isToday
              ? "bg-red-500 text-white rounded-full w-6 h-6"
              : isCurrentMonth
                ? "text-foreground w-6 h-6"
                : "text-muted-foreground/40 w-6 h-6"
          }`}
        >
          {date.getDate()}
        </span>

        {/* Heartbeat dots */}
        {heartbeatCount > 0 && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-[2px]">
                {heartbeatCount <= 5 ? (
                  Array.from({ length: heartbeatCount }).map((_, i) => (
                    <span
                      key={i}
                      className="block w-1 h-1 rounded-full bg-muted-foreground/40"
                    />
                  ))
                ) : (
                  <>
                    <span className="block w-1 h-1 rounded-full bg-muted-foreground/40" />
                    <span className="text-[9px] text-muted-foreground/50 font-mono leading-none">
                      {heartbeatCount}
                    </span>
                  </>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {heartbeatCount} heartbeat{heartbeatCount !== 1 ? "s" : ""}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Schedule event pills */}
      <div className="flex flex-col gap-[2px]">
        {visible.map((evt, i) => {
          const hue = agentColorMap.get(evt.agentId) ?? 45;
          const agent = agentMap.get(evt.agentId);
          const time = new Date(evt.scheduledAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
          return (
            <Tooltip key={`${evt.scheduleId}-${i}`} delayDuration={200}>
              <TooltipTrigger asChild>
                <div
                  className="rounded px-1.5 py-[1px] text-[10px] font-medium leading-tight truncate cursor-default"
                  style={{
                    backgroundColor: `oklch(0.35 0.06 ${hue})`,
                    color: `oklch(0.85 0.08 ${hue})`,
                    borderLeft: `2px solid oklch(0.6 0.15 ${hue})`,
                  }}
                >
                  {evt.scheduleName ?? "Schedule"}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px]">
                <div className="space-y-1">
                  <div className="font-medium text-xs">
                    {evt.scheduleName}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {time}
                  </div>
                  {agent && (
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <AgentIcon icon={agent.icon} className="h-3 w-3" />
                      {agent.name}
                    </div>
                  )}
                  {evt.cronExpression && (
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {evt.cronExpression}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {overflow > 0 && (
          <div className="text-[10px] text-muted-foreground font-medium px-1 cursor-default hover:text-foreground transition-colors">
            +{overflow} more
          </div>
        )}
      </div>
    </div>
  );
}

// --- Agent Multi-Select Filter ---
interface AgentFilterProps {
  agents: Agent[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

function AgentFilter({ agents, selectedIds, onToggle, onClear }: AgentFilterProps) {
  const sorted = useMemo(
    () =>
      agents
        .filter((a) => a.status === "active" || a.status === "idle")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  const label =
    selectedIds.length === 0
      ? "All agents"
      : selectedIds.length === 1
        ? agents.find((a) => a.id === selectedIds[0])?.name ?? "1 agent"
        : `${selectedIds.length} agents`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
        >
          <Filter className="h-3 w-3" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-2" align="end">
        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {sorted.map((agent) => (
            <label
              key={agent.id}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-xs"
            >
              <Checkbox
                checked={selectedIds.includes(agent.id)}
                onCheckedChange={() => onToggle(agent.id)}
              />
              <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{agent.name}</span>
            </label>
          ))}
        </div>
        {selectedIds.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-1 text-xs h-7"
            onClick={onClear}
          >
            Clear filter
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// --- Main Timeline Component ---
export function Timeline() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [searchParams] = useSearchParams();

  // Read initial filter state from URL params
  const [agentFilterIds, setAgentFilterIds] = useState<string[]>(() =>
    readArrayParam(searchParams, "agents"),
  );
  const [typeFilter, setTypeFilter] = useState<string[]>(() => {
    const types = readArrayParam(searchParams, "types");
    return types.length > 0 ? types : ["heartbeat", "scheduled_issue"];
  });

  // Day detail sheet
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    setBreadcrumbs([{ label: "Timeline" }]);
  }, [setBreadcrumbs]);

  // Persist filters to URL
  const syncFiltersToUrl = useCallback(
    (agents: string[], types: string[]) => {
      writeFiltersToUrl(agents, types);
    },
    [],
  );

  const handleAgentToggle = useCallback(
    (id: string) => {
      setAgentFilterIds((prev) => {
        const next = toggleInArray(prev, id);
        syncFiltersToUrl(next, typeFilter);
        return next;
      });
    },
    [syncFiltersToUrl, typeFilter],
  );

  const handleAgentClear = useCallback(() => {
    setAgentFilterIds([]);
    syncFiltersToUrl([], typeFilter);
  }, [syncFiltersToUrl, typeFilter]);

  const handleTypeToggle = useCallback(
    (type: string) => {
      setTypeFilter((prev) => {
        const next = toggleInArray(prev, type);
        // Don't allow empty — at least one must be active
        if (next.length === 0) return prev;
        syncFiltersToUrl(agentFilterIds, next);
        return next;
      });
    },
    [syncFiltersToUrl, agentFilterIds],
  );

  const calendarDays = useMemo(
    () => buildCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const from = calendarDays[0]!;
  const to = useMemo(() => {
    const last = calendarDays[calendarDays.length - 1]!;
    const end = new Date(last);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [calendarDays]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Fetch all events (no server-side agent filter — we filter client-side for multi-select)
  const { data: timeline, isLoading } = useQuery({
    queryKey: queryKeys.timeline(
      selectedCompanyId!,
      from.toISOString(),
      to.toISOString(),
    ),
    queryFn: () =>
      timelineApi.list(selectedCompanyId!, from.toISOString(), to.toISOString()),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  // Apply client-side filters
  const filteredEvents = useMemo(() => {
    let events = timeline?.events ?? [];
    if (agentFilterIds.length > 0) {
      const ids = new Set(agentFilterIds);
      events = events.filter((e) => ids.has(e.agentId));
    }
    if (typeFilter.length < 2) {
      events = events.filter((e) => typeFilter.includes(e.type));
    }
    return events;
  }, [timeline, agentFilterIds, typeFilter]);

  // Build consistent color map for agents
  const agentColorMap = useMemo(() => {
    const map = new Map<string, number>();
    const ids = [
      ...new Set((timeline?.events ?? []).map((e) => e.agentId)),
    ].sort();
    ids.forEach((id, i) => map.set(id, agentHue(id, i)));
    return map;
  }, [timeline]);

  // Group filtered events by date key
  const eventsByDate = useMemo(() => {
    const map = new Map<
      string,
      { heartbeats: TimelineEvent[]; schedules: TimelineEvent[] }
    >();
    for (const evt of filteredEvents) {
      const d = new Date(evt.scheduledAt);
      const key = dateKey(d);
      if (!map.has(key)) map.set(key, { heartbeats: [], schedules: [] });
      const bucket = map.get(key)!;
      if (evt.type === "heartbeat") {
        bucket.heartbeats.push(evt);
      } else {
        bucket.schedules.push(evt);
      }
    }
    return map;
  }, [filteredEvents]);

  // Agents that appear in the current view (from unfiltered data for legend)
  const agentsInView = useMemo(() => {
    const ids = [
      ...new Set((timeline?.events ?? []).map((e) => e.agentId)),
    ];
    return ids
      .map((id) => agentMap.get(id))
      .filter((a): a is Agent => !!a)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [timeline, agentMap]);

  // Events for the selected day (for the detail sheet)
  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    const key = dateKey(selectedDay);
    const bucket = eventsByDate.get(key);
    if (!bucket) return [];
    return [...bucket.schedules, ...bucket.heartbeats];
  }, [selectedDay, eventsByDate]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function goToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  }

  const isCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={CalendarDays}
        message="Select a company to view the timeline."
      />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  // Stats for the header
  const totalSchedules = filteredEvents.filter(
    (e) => e.type === "scheduled_issue",
  ).length;
  const totalHeartbeats = filteredEvents.filter(
    (e) => e.type === "heartbeat",
  ).length;

  const showHeartbeats = typeFilter.includes("heartbeat");
  const showSchedules = typeFilter.includes("scheduled_issue");

  return (
    <div className="space-y-3 animate-page-enter">
      {/* Header bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2
            className="text-lg font-semibold min-w-[180px] text-center select-none"
            style={{ fontFamily: "var(--font-family-display)" }}
          >
            {formatMonth(new Date(viewYear, viewMonth))}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {!isCurrentMonth && (
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground ml-2">
          {totalSchedules > 0 && (
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              {totalSchedules} scheduled
            </span>
          )}
          {totalHeartbeats > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {totalHeartbeats} heartbeats
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="ml-auto flex items-center gap-2">
          {/* Event type toggles */}
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            <button
              className={`px-2.5 py-1 text-xs transition-colors ${
                showHeartbeats
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => handleTypeToggle("heartbeat")}
            >
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Heartbeats
              </span>
            </button>
            <div className="w-px h-5 bg-border" />
            <button
              className={`px-2.5 py-1 text-xs transition-colors ${
                showSchedules
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => handleTypeToggle("scheduled_issue")}
            >
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                Schedules
              </span>
            </button>
          </div>

          {/* Agent multi-select filter */}
          <AgentFilter
            agents={agents ?? []}
            selectedIds={agentFilterIds}
            onToggle={handleAgentToggle}
            onClear={handleAgentClear}
          />
        </div>
      </div>

      {/* Calendar grid */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {DAY_NAMES.map((day) => (
            <div
              key={day}
              className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center border-r border-border/50 last:border-r-0 bg-muted/20"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar cells — 6 rows x 7 cols */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const key = dateKey(day);
            const bucket = eventsByDate.get(key);
            return (
              <DayCell
                key={key}
                date={day}
                isCurrentMonth={day.getMonth() === viewMonth}
                isToday={isSameDay(day, today)}
                heartbeatCount={bucket?.heartbeats.length ?? 0}
                scheduleEvents={bucket?.schedules ?? []}
                agentColorMap={agentColorMap}
                agentMap={agentMap}
                onClick={setSelectedDay}
              />
            );
          })}
        </div>
      </div>

      {/* Agent legend */}
      {agentsInView.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground px-1">
          <span className="font-medium uppercase tracking-wider">Agents:</span>
          {agentsInView.map((agent) => {
            const hue = agentColorMap.get(agent.id) ?? 45;
            return (
              <span key={agent.id} className="flex items-center gap-1.5">
                <span
                  className="block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: `oklch(0.6 0.15 ${hue})` }}
                />
                <AgentIcon icon={agent.icon} className="h-3 w-3" />
                {agent.name}
              </span>
            );
          })}
        </div>
      )}

      {/* Day detail sheet */}
      <DayDetailSheet
        open={!!selectedDay}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
        date={selectedDay}
        events={selectedDayEvents}
        agentColorMap={agentColorMap}
        agentMap={agentMap}
      />
    </div>
  );
}
