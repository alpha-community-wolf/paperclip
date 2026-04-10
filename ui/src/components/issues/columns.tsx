import React from "react";
import { createColumnHelper } from "@tanstack/react-table";
import type { Issue } from "@paperclipai/shared";
import type { TaskCronSchedule } from "@paperclipai/shared";
import { cn, formatDateTime, activityLevel, activityConfig } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
import { DependencyPills } from "@/components/DependencyPills";
import { Identity } from "@/components/Identity";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  User,
  Clock3,
  FolderKanban,
  Pause,
  Play,
  Save,
  XCircle,
  RotateCcw,
  Loader2,
  Repeat,
  Copy,
} from "lucide-react";

/* ── Shared types exported for use in IssuesList and IssueCard ── */

export interface Agent {
  id: string;
  name: string;
}

export interface FailedRunInfo {
  runId: string;
  agentId: string;
  agentName: string;
  error?: string | null;
  finishedAt: string | null;
}

export interface IssueColumnContext {
  issueLinkState?: unknown;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  agents?: Agent[];
  agentName: (id: string | null) => string | null;
  liveIssueIds?: Set<string>;
  failedRunMap?: Map<string, FailedRunInfo>;
  retryingIssueId: string | null;
  onRetry: (agentId: string, issueId: string) => void;
  recurringIssueIds: Set<string>;
  templateIssueIds: Set<string>;
  spawnedFromTemplateIds: Set<string>;
  recurringByIssueId: Map<string, TaskCronSchedule[]>;
  recurringPickerIssueId: string | null;
  setRecurringPickerIssueId: (id: string | null) => void;
  scheduleDraftValue: (schedule: TaskCronSchedule) => string;
  onUpdateSchedule: (args: { scheduleId: string; patch: { enabled?: boolean; expression?: string } }) => void;
  isUpdatingSchedule: boolean;
  setRecurringDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  assigneePickerIssueId: string | null;
  setAssigneePickerIssueId: (id: string | null) => void;
  assigneeSearch: string;
  setAssigneeSearch: (s: string) => void;
  projectPickerIssueId: string | null;
  setProjectPickerIssueId: (id: string | null) => void;
  projectSearch: string;
  setProjectSearch: (s: string) => void;
  allProjects?: Array<{ id: string; name: string; color: string | null }>;
  kbSelectedIssueId: string | null;
  issueRowRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  hasSelection: boolean;
}

/* ── Column size constants (px) — applied as <col> widths ── */

export const COLUMN_SIZES: Record<string, number | undefined> = {
  select: 32,
  priority: 28,
  status: 110,
  identifier: 72,
  title: undefined, // auto — fills remaining space
  type: 90,
  runState: 90,
  assignee: 150,
  project: 150,
  updatedAt: 150,
};

/* ── Activity dot ── */

function ActivityDot({ date }: { date: Date | string }) {
  const level = activityLevel(date);
  const config = activityConfig[level];
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full shrink-0", config.className, {
        "bg-orange-500": level === "hot",
        "bg-yellow-500 dark:bg-yellow-400": level === "warm",
        "bg-blue-400": level === "cold",
        "bg-muted-foreground/40": level === "stale",
      })}
      title={`${config.label} — updated ${timeAgo(date)}`}
    />
  );
}

/* ── Column definitions ── */

const col = createColumnHelper<Issue>();

function ctx(table: { options: { meta?: unknown } }): IssueColumnContext {
  return table.options.meta as IssueColumnContext;
}

export const issueColumns = [
  /* Col 1: Checkbox */
  col.display({
    id: "select",
    size: COLUMN_SIZES.select,
    header: () => null,
    cell: ({ row, table }) => {
      const c = ctx(table);
      return (
        <span
          className={cn(
            "flex items-center justify-center w-5 h-5",
            c.hasSelection ? "visible" : "invisible group-hover/row:visible",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={() => row.toggleSelected()}
            className="h-4 w-4"
          />
        </span>
      );
    },
  }),

  /* Col 2: Priority */
  col.display({
    id: "priority",
    size: COLUMN_SIZES.priority,
    header: () => null,
    cell: ({ row, table }) => {
      const c = ctx(table);
      const issue = row.original;
      return (
        <span
          className="inline-flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <PriorityIcon
            priority={issue.priority}
            onChange={(p) => c.onUpdateIssue(issue.id, { priority: p })}
          />
        </span>
      );
    },
  }),

  /* Col 3: Status */
  col.display({
    id: "status",
    size: COLUMN_SIZES.status,
    header: () => "Status",
    cell: ({ row, table }) => {
      const c = ctx(table);
      const issue = row.original;
      return (
        <span
          className="inline-flex items-center justify-start"
          onClick={(e) => e.stopPropagation()}
        >
          <StatusIcon
            status={issue.status}
            onChange={(s) => c.onUpdateIssue(issue.id, { status: s })}
            showLabel
            linkSummary={issue.linkSummary}
          />
        </span>
      );
    },
  }),

  /* Col 4: Identifier */
  col.display({
    id: "identifier",
    size: COLUMN_SIZES.identifier,
    header: () => "ID",
    cell: ({ row }) => {
      const issue = row.original;
      return (
        <span className="text-xs text-muted-foreground font-mono">
          {issue.identifier ?? issue.id.slice(0, 8)}
        </span>
      );
    },
  }),

  /* Col 5: Title */
  col.display({
    id: "title",
    size: COLUMN_SIZES.title,
    header: () => "Title",
    cell: ({ row }) => {
      const issue = row.original;
      return (
        <span className="min-w-0 overflow-hidden block">
          <span className="line-clamp-1 truncate block text-sm">{issue.title}</span>
          {issue.description && (
            <span className="line-clamp-1 text-[11px] text-muted-foreground mt-0.5 block">
              {issue.description.replace(/[\n\r]+/g, " ").slice(0, 120)}
            </span>
          )}
          {(issue.labels ?? []).length > 0 && (
            <span className="inline-flex items-center gap-1 ml-2 align-middle">
              {(issue.labels ?? []).slice(0, 3).map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    borderColor: label.color,
                    color: label.color,
                    backgroundColor: `${label.color}1f`,
                  }}
                >
                  {label.name}
                </span>
              ))}
              {(issue.labels ?? []).length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{(issue.labels ?? []).length - 3}
                </span>
              )}
            </span>
          )}
          {issue.linkSummary && (
            <span
              className="inline-flex ml-2 align-middle"
              onClick={(e) => e.stopPropagation()}
            >
              <DependencyPills issueId={issue.id} linkSummary={issue.linkSummary} />
            </span>
          )}
        </span>
      );
    },
  }),

  /* Col 6: Type badges */
  col.display({
    id: "type",
    size: COLUMN_SIZES.type,
    header: () => "Type",
    cell: ({ row, table }) => {
      const c = ctx(table);
      const issue = row.original;
      return (
        <span className="flex items-center gap-1 overflow-hidden">
          {issue.type === "plan" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-600 dark:text-violet-400">
              Plan
            </span>
          )}
          {issue.type === "explore" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">
              Explore
            </span>
          )}
          {c.templateIssueIds.has(issue.id) ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/40 bg-teal-500/10 px-1.5 py-0.5 text-[10px] text-teal-600 dark:text-teal-400">
              <Repeat className="h-2.5 w-2.5" />
              Template
            </span>
          ) : c.recurringIssueIds.has(issue.id) ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              <Clock3 className="h-2.5 w-2.5" />
              Recurring
            </span>
          ) : null}
          {c.spawnedFromTemplateIds.has(issue.id) && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
              <Copy className="h-2.5 w-2.5" />
              Scheduled
            </span>
          )}
        </span>
      );
    },
  }),

  /* Col 7: Run state */
  col.display({
    id: "runState",
    size: COLUMN_SIZES.runState,
    header: () => "State",
    cell: ({ row, table }) => {
      const c = ctx(table);
      const issue = row.original;
      if (c.liveIssueIds?.has(issue.id)) {
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Live</span>
          </span>
        );
      }
      if (c.failedRunMap?.has(issue.id)) {
        const info = c.failedRunMap.get(issue.id)!;
        const isRetrying = c.retryingIssueId === issue.id;
        return (
          <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10"
              title={info.error ?? `Last run by ${info.agentName} failed`}
            >
              <XCircle className="h-3 w-3 text-red-500" />
              <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Failed</span>
            </span>
            <button
              type="button"
              className="inline-flex items-center justify-center h-5 w-5 rounded-full hover:bg-muted transition-colors"
              title={`Retry ${info.agentName}`}
              disabled={isRetrying}
              onClick={(e) => {
                e.stopPropagation();
                c.onRetry(info.agentId, issue.id);
              }}
            >
              {isRetrying
                ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                : <RotateCcw className="h-3 w-3 text-muted-foreground hover:text-foreground" />}
            </button>
          </span>
        );
      }
      return null;
    },
  }),

  /* Col 8: Assignee (+ recurring schedule pill) */
  col.display({
    id: "assignee",
    size: COLUMN_SIZES.assignee,
    header: () => "Assignee",
    cell: ({ row, table }) => {
      const c = ctx(table);
      const issue = row.original;
      const issueSchedules = c.recurringByIssueId.get(issue.id) ?? [];
      const enabledCount = issueSchedules.filter((s) => s.enabled).length;
      return (
        <span
          className="inline-flex items-center gap-1 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {issueSchedules.length > 0 && (
            <Popover
              open={c.recurringPickerIssueId === issue.id}
              onOpenChange={(open) => c.setRecurringPickerIssueId(open ? issue.id : null)}
            >
              <PopoverTrigger asChild>
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent/50 transition-colors shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Clock3 className="h-3 w-3" />
                  {enabledCount}/{issueSchedules.length}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-80 p-2"
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="space-y-2">
                  {issueSchedules.map((schedule) => (
                    <div key={schedule.id} className="rounded border border-border p-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{schedule.name}</span>
                        <span className="ml-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              c.onUpdateSchedule({
                                scheduleId: schedule.id,
                                patch: { enabled: !schedule.enabled },
                              });
                            }}
                            disabled={c.isUpdatingSchedule}
                          >
                            {schedule.enabled ? (
                              <><Pause className="h-3 w-3 mr-1" />Stop</>
                            ) : (
                              <><Play className="h-3 w-3 mr-1" />Start</>
                            )}
                          </Button>
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <input
                          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-[11px] font-mono"
                          value={c.scheduleDraftValue(schedule)}
                          onChange={(e) =>
                            c.setRecurringDrafts((prev) => ({
                              ...prev,
                              [schedule.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            c.onUpdateSchedule({
                              scheduleId: schedule.id,
                              patch: { expression: c.scheduleDraftValue(schedule).trim() },
                            });
                          }}
                          disabled={c.isUpdatingSchedule || c.scheduleDraftValue(schedule).trim().length === 0}
                        >
                          <Save className="h-3 w-3 mr-1" />Save
                        </Button>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {schedule.timezone} - {schedule.enabled ? "enabled" : "disabled"} - next{" "}
                        {schedule.nextTriggerAt ? timeAgo(schedule.nextTriggerAt) : "not scheduled"}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          <Popover
            open={c.assigneePickerIssueId === issue.id}
            onOpenChange={(open) => {
              c.setAssigneePickerIssueId(open ? issue.id : null);
              if (!open) c.setAssigneeSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <button className="flex items-center rounded-md px-2 py-1 hover:bg-accent/50 transition-colors min-w-0">
                {issue.assigneeAgentId && c.agentName(issue.assigneeAgentId) ? (
                  <Identity name={c.agentName(issue.assigneeAgentId)!} size="sm" />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30">
                      <User className="h-3 w-3" />
                    </span>
                    Assignee
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-56 p-1"
              align="end"
              onClick={(e) => e.stopPropagation()}
              onPointerDownOutside={() => c.setAssigneeSearch("")}
            >
              <input
                className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                placeholder="Search agents..."
                value={c.assigneeSearch}
                onChange={(e) => c.setAssigneeSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto overscroll-contain">
                <button
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                    !issue.assigneeAgentId && "bg-accent",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    c.onUpdateIssue(issue.id, { assigneeAgentId: null, assigneeUserId: null });
                    c.setAssigneePickerIssueId(null);
                    c.setAssigneeSearch("");
                  }}
                >
                  No assignee
                </button>
                {(c.agents ?? [])
                  .filter((agent) =>
                    !c.assigneeSearch.trim() ||
                    agent.name.toLowerCase().includes(c.assigneeSearch.toLowerCase()),
                  )
                  .map((agent) => (
                    <button
                      key={agent.id}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left",
                        issue.assigneeAgentId === agent.id && "bg-accent",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        c.onUpdateIssue(issue.id, { assigneeAgentId: agent.id, assigneeUserId: null });
                        c.setAssigneePickerIssueId(null);
                        c.setAssigneeSearch("");
                      }}
                    >
                      <Identity name={agent.name} size="sm" className="min-w-0" />
                    </button>
                  ))}
              </div>
            </PopoverContent>
          </Popover>
        </span>
      );
    },
  }),

  /* Col 9: Project */
  col.display({
    id: "project",
    size: COLUMN_SIZES.project,
    header: () => "Project",
    cell: ({ row, table }) => {
      const c = ctx(table);
      const issue = row.original;
      return (
        <span
          className="inline-flex items-center overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <Popover
            open={c.projectPickerIssueId === issue.id}
            onOpenChange={(open) => {
              c.setProjectPickerIssueId(open ? issue.id : null);
              if (!open) c.setProjectSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <button className="flex items-center rounded-md px-2 py-1 hover:bg-accent/50 transition-colors min-w-0">
                {issue.projectId && issue.project ? (
                  <span className="inline-flex items-center gap-1.5 text-xs min-w-0">
                    <span
                      className="shrink-0 h-3 w-3 rounded-sm"
                      style={{ backgroundColor: issue.project.color ?? "#6366f1" }}
                    />
                    <span className="truncate">{issue.project.name}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30">
                      <FolderKanban className="h-3 w-3" />
                    </span>
                    Project
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-56 p-1"
              align="end"
              onClick={(e) => e.stopPropagation()}
              onPointerDownOutside={() => c.setProjectSearch("")}
            >
              <input
                className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                placeholder="Search projects..."
                value={c.projectSearch}
                onChange={(e) => c.setProjectSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto overscroll-contain">
                <button
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                    !issue.projectId && "bg-accent",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    c.onUpdateIssue(issue.id, { projectId: null });
                    c.setProjectPickerIssueId(null);
                  }}
                >
                  No project
                </button>
                {(c.allProjects ?? [])
                  .filter((proj) =>
                    !c.projectSearch.trim() ||
                    proj.name.toLowerCase().includes(c.projectSearch.toLowerCase()),
                  )
                  .map((proj) => (
                    <button
                      key={proj.id}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left",
                        issue.projectId === proj.id && "bg-accent",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        c.onUpdateIssue(issue.id, { projectId: proj.id });
                        c.setProjectPickerIssueId(null);
                      }}
                    >
                      <span
                        className="shrink-0 h-3 w-3 rounded-sm"
                        style={{ backgroundColor: proj.color ?? "#6366f1" }}
                      />
                      <span className="truncate">{proj.name}</span>
                    </button>
                  ))}
              </div>
            </PopoverContent>
          </Popover>
        </span>
      );
    },
  }),

  /* Col 10: Updated date */
  col.display({
    id: "updatedAt",
    size: COLUMN_SIZES.updatedAt,
    header: () => "Updated",
    cell: ({ row }) => {
      const issue = row.original;
      const level = activityLevel(issue.updatedAt);
      const config = activityConfig[level];
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          <span
            className={cn("inline-block h-2 w-2 rounded-full shrink-0", config.className, {
              "bg-orange-500": level === "hot",
              "bg-yellow-500 dark:bg-yellow-400": level === "warm",
              "bg-blue-400": level === "cold",
              "bg-muted-foreground/40": level === "stale",
            })}
          />
          {formatDateTime(issue.updatedAt)}
        </span>
      );
    },
  }),
];
