import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  CalendarClock,
} from "lucide-react";
import { timelineApi, type TimelineEvent } from "../api/timeline";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  // Use a simple hash of the agentId for consistent coloring
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  }
  return AGENT_HUES[Math.abs(hash) % AGENT_HUES.length] ?? (index * 37) % 360;
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Build the 6-row calendar grid for a given month */
function buildCalendarDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const start = startOfWeek(firstOfMonth);
  const days: Date[] = [];
  // Always render 6 weeks (42 days) for consistent grid height
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

interface DayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  heartbeatCount: number;
  scheduleEvents: TimelineEvent[];
  agentColorMap: Map<string, number>;
  agentMap: Map<string, Agent>;
}

function DayCell({
  date,
  isCurrentMonth,
  isToday,
  heartbeatCount,
  scheduleEvents,
  agentColorMap,
  agentMap,
}: DayCellProps) {
  const visible = scheduleEvents.slice(0, 3);
  const overflow = scheduleEvents.length - 3;

  return (
    <div
      className={`min-h-[90px] border-b border-r border-border/50 px-1.5 py-1 transition-colors ${
        isCurrentMonth
          ? "bg-background"
          : "bg-muted/10"
      } ${isToday ? "ring-1 ring-inset ring-primary/30" : ""}`}
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
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <div className="text-[10px] text-muted-foreground font-medium px-1 cursor-default hover:text-foreground transition-colors">
                +{overflow} more
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[240px]">
              <div className="space-y-0.5">
                {scheduleEvents.slice(3).map((evt, i) => (
                  <div key={i} className="text-[11px]">
                    {evt.scheduleName} — {new Date(evt.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function Timeline() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [agentFilter, setAgentFilter] = useState("all");

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    setBreadcrumbs([{ label: "Timeline" }]);
  }, [setBreadcrumbs]);

  const calendarDays = useMemo(
    () => buildCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  // Date range: first and last calendar day shown
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

  const { data: timeline, isLoading } = useQuery({
    queryKey: queryKeys.timeline(
      selectedCompanyId!,
      from.toISOString(),
      to.toISOString(),
      agentFilter !== "all" ? agentFilter : undefined,
    ),
    queryFn: () =>
      timelineApi.list(
        selectedCompanyId!,
        from.toISOString(),
        to.toISOString(),
        agentFilter !== "all" ? agentFilter : undefined,
      ),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  // Build consistent color map for agents
  const agentColorMap = useMemo(() => {
    const map = new Map<string, number>();
    const ids = [...new Set((timeline?.events ?? []).map((e) => e.agentId))].sort();
    ids.forEach((id, i) => map.set(id, agentHue(id, i)));
    return map;
  }, [timeline]);

  // Group events by date key
  const eventsByDate = useMemo(() => {
    const map = new Map<string, { heartbeats: TimelineEvent[]; schedules: TimelineEvent[] }>();
    for (const evt of timeline?.events ?? []) {
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
  }, [timeline]);

  // Agents that appear in the current view
  const agentsInView = useMemo(() => {
    const ids = [...new Set((timeline?.events ?? []).map((e) => e.agentId))];
    return ids
      .map((id) => agentMap.get(id))
      .filter((a): a is Agent => !!a)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [timeline, agentMap]);

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
      <EmptyState icon={CalendarDays} message="Select a company to view the timeline." />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  // Stats for the header
  const totalSchedules = (timeline?.events ?? []).filter(
    (e) => e.type === "scheduled_issue",
  ).length;
  const totalHeartbeats = (timeline?.events ?? []).filter(
    (e) => e.type === "heartbeat",
  ).length;

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

        {/* Agent filter */}
        <div className="ml-auto">
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {(agents ?? [])
                .filter((a) => a.status === "active" || a.status === "idle")
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <AgentIcon icon={a.icon} className="h-3.5 w-3.5 shrink-0" />
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
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
    </div>
  );
}
