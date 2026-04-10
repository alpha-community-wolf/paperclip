import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type RowSelectionState,
  type OnChangeFn,
  type ColumnDef,
} from "@tanstack/react-table";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { taskCronsApi } from "../api/taskCrons";
import { queryKeys } from "../lib/queryKeys";
import { groupBy } from "../lib/groupBy";
import { formatDate, formatDateTime, cn, timeUntil } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { EmptyState } from "./EmptyState";
import { Identity } from "./Identity";
import { PageSkeleton } from "./PageSkeleton";
import { IssueCard } from "./IssueCard";
import { issueColumns, type IssueColumnContext, type Agent, type FailedRunInfo } from "./issues/columns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CircleDot,
  Plus,
  Filter,
  ArrowUpDown,
  Layers,
  Check,
  X,
  ChevronRight,
  List,
  Columns3,
  User,
  Search,
  CalendarClock,
  Clock3,
  Repeat,
  History,
  Zap,
  Loader2,
  FolderKanban,
  Keyboard,
  CheckSquare,
  MinusSquare,
} from "lucide-react";
import { KanbanBoard } from "./KanbanBoard";
import { useIssueTriageKeyboard } from "../hooks/useIssueTriageKeyboard";
import type { Issue } from "@paperclipai/shared";
import type { TaskCronSchedule } from "@paperclipai/shared";

/* ── Helpers ── */

const statusOrder = ["in_progress", "todo", "backlog", "in_review", "blocked", "done", "cancelled"];
const pastStatuses = new Set(["done", "cancelled"]);
const priorityOrder = ["critical", "high", "medium", "low"];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── View state ── */

export type IssueViewState = {
  statuses: string[];
  priorities: string[];
  assignees: string[];
  labels: string[];
  recurringFilter: "all" | "recurring_only";
  showTemplates: boolean;
  sortField: "status" | "priority" | "title" | "created" | "updated";
  sortDir: "asc" | "desc";
  groupBy: "status" | "priority" | "assignee" | "recurring" | "none";
  viewMode: "list" | "board";
  collapsedGroups: string[];
};

const defaultViewState: IssueViewState = {
  statuses: [],
  priorities: [],
  assignees: [],
  labels: [],
  recurringFilter: "all",
  showTemplates: false,
  sortField: "updated",
  sortDir: "desc",
  groupBy: "none",
  viewMode: "list",
  collapsedGroups: [],
};

const quickFilterPresets = [
  { label: "All", statuses: [] as string[] },
  { label: "Active", statuses: ["todo", "in_progress", "in_review", "blocked"] },
  { label: "Backlog", statuses: ["backlog"] },
  { label: "Done", statuses: ["done", "cancelled"] },
];

function getViewState(key: string): IssueViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaultViewState, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultViewState };
}

function saveViewState(key: string, state: IssueViewState) {
  localStorage.setItem(key, JSON.stringify(state));
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function applyFilters(
  issues: Issue[],
  state: IssueViewState,
  recurringIssueIds: Set<string>,
  templateIssueIds: Set<string>,
): Issue[] {
  let result = issues;
  if (state.statuses.length > 0) result = result.filter((i) => state.statuses.includes(i.status));
  if (state.priorities.length > 0) result = result.filter((i) => state.priorities.includes(i.priority));
  if (state.assignees.length > 0) result = result.filter((i) => i.assigneeAgentId != null && state.assignees.includes(i.assigneeAgentId));
  if (state.labels.length > 0) result = result.filter((i) => (i.labelIds ?? []).some((id) => state.labels.includes(id)));
  if (state.recurringFilter === "recurring_only") result = result.filter((i) => recurringIssueIds.has(i.id));
  if (!state.showTemplates) result = result.filter((i) => !templateIssueIds.has(i.id));
  return result;
}

function sortIssues(issues: Issue[], state: IssueViewState): Issue[] {
  const sorted = [...issues];
  const dir = state.sortDir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (state.sortField) {
      case "status":
        return dir * (statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
      case "priority":
        return dir * (priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));
      case "title":
        return dir * a.title.localeCompare(b.title);
      case "created":
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "updated":
        return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      default:
        return 0;
    }
  });
  return sorted;
}

function countActiveFilters(state: IssueViewState): number {
  let count = 0;
  if (state.statuses.length > 0) count++;
  if (state.priorities.length > 0) count++;
  if (state.assignees.length > 0) count++;
  if (state.labels.length > 0) count++;
  if (state.recurringFilter === "recurring_only") count++;
  if (state.showTemplates) count++;
  return count;
}

/* ── Component ── */

export type { Agent, FailedRunInfo };

export interface IssuesListProps {
  issues: Issue[];
  isLoading?: boolean;
  error?: Error | null;
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  failedRunMap?: Map<string, FailedRunInfo>;
  projectId?: string;
  viewStateKey: string;
  issueLinkState?: unknown;
  initialAssignees?: string[];
  initialSearch?: string;
  onSearchChange?: (search: string) => void;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
}

export function IssuesList({
  issues,
  isLoading,
  error,
  agents,
  liveIssueIds,
  failedRunMap,
  projectId,
  viewStateKey,
  issueLinkState,
  initialAssignees,
  initialSearch,
  onSearchChange,
  onUpdateIssue,
}: IssuesListProps) {
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();
  const queryClient = useQueryClient();

  // Scope the storage key per company so folding/view state is independent across companies.
  const scopedKey = selectedCompanyId ? `${viewStateKey}:${selectedCompanyId}` : viewStateKey;

  const [viewState, setViewState] = useState<IssueViewState>(() => {
    if (initialAssignees) {
      return { ...defaultViewState, assignees: initialAssignees, statuses: [] };
    }
    return getViewState(scopedKey);
  });
  const [retryingIssueId, setRetryingIssueId] = useState<string | null>(null);

  const retryMutation = useMutation({
    mutationFn: async ({ agentId, issueId }: { agentId: string; issueId: string }) => {
      return agentsApi.wakeup(agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "Retry after failure",
        payload: { issueId },
      }, selectedCompanyId ?? undefined);
    },
    onMutate: ({ issueId }) => setRetryingIssueId(issueId),
    onSettled: () => {
      setRetryingIssueId(null);
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.failedRuns(selectedCompanyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId) });
      }
    },
  });

  // Row selection state (replaces the previous selectedIds Set)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedIds = useMemo(
    () => new Set(Object.entries(rowSelection).filter(([, v]) => v).map(([k]) => k)),
    [rowSelection],
  );
  const hasSelection = selectedIds.size > 0;
  const clearSelection = useCallback(() => setRowSelection({}), []);

  const [bulkAssigneeOpen, setBulkAssigneeOpen] = useState(false);
  const [bulkProjectOpen, setBulkProjectOpen] = useState(false);
  const [bulkAssigneeSearch, setBulkAssigneeSearch] = useState("");
  const [bulkProjectSearch, setBulkProjectSearch] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const [assigneePickerIssueId, setAssigneePickerIssueId] = useState<string | null>(null);
  const [projectPickerIssueId, setProjectPickerIssueId] = useState<string | null>(null);
  const [recurringPickerIssueId, setRecurringPickerIssueId] = useState<string | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [recurringDrafts, setRecurringDrafts] = useState<Record<string, string>>({});
  const [issueSearch, setIssueSearch] = useState(initialSearch ?? "");
  const [debouncedIssueSearch, setDebouncedIssueSearch] = useState(issueSearch);
  const normalizedIssueSearch = debouncedIssueSearch.trim();

  useEffect(() => {
    setIssueSearch(initialSearch ?? "");
  }, [initialSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedIssueSearch(issueSearch);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [issueSearch]);

  // Reload view state from localStorage when company changes (scopedKey changes).
  const prevScopedKey = useRef(scopedKey);
  useEffect(() => {
    if (prevScopedKey.current !== scopedKey) {
      prevScopedKey.current = scopedKey;
      setViewState(initialAssignees
        ? { ...defaultViewState, assignees: initialAssignees, statuses: [] }
        : getViewState(scopedKey));
    }
  }, [scopedKey, initialAssignees]);

  const updateView = useCallback((patch: Partial<IssueViewState>) => {
    setViewState((prev) => {
      const next = { ...prev, ...patch };
      saveViewState(scopedKey, next);
      return next;
    });
  }, [scopedKey]);

  const { data: searchedIssues = [] } = useQuery({
    queryKey: queryKeys.issues.search(selectedCompanyId!, normalizedIssueSearch, projectId),
    queryFn: () => issuesApi.list(selectedCompanyId!, { q: normalizedIssueSearch, projectId }),
    enabled: !!selectedCompanyId && normalizedIssueSearch.length > 0,
  });

  const { data: recurringSchedules = [] } = useQuery({
    queryKey: queryKeys.taskCrons.company(selectedCompanyId!),
    queryFn: () => taskCronsApi.listCompanySchedules(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const recurringByIssueId = useMemo(() => {
    const map = new Map<string, TaskCronSchedule[]>();
    for (const schedule of recurringSchedules) {
      if (!schedule.issueId) continue;
      const existing = map.get(schedule.issueId);
      if (existing) existing.push(schedule);
      else map.set(schedule.issueId, [schedule]);
    }
    return map;
  }, [recurringSchedules]);

  const recurringIssueIds = useMemo(
    () => new Set<string>(Array.from(recurringByIssueId.keys())),
    [recurringByIssueId],
  );

  // Issues that have at least one active create_new schedule (template sources)
  const templateIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [issueId, schedules] of recurringByIssueId) {
      if (schedules.some((s) => s.enabled && s.issueMode === "create_new")) {
        ids.add(issueId);
      }
    }
    return ids;
  }, [recurringByIssueId]);

  // Issues spawned from a template (parentId points to a template issue)
  const spawnedFromTemplateIds = useMemo(() => {
    if (!issues || templateIssueIds.size === 0) return new Set<string>();
    const ids = new Set<string>();
    for (const issue of issues) {
      if (issue.parentId && templateIssueIds.has(issue.parentId)) {
        ids.add(issue.id);
      }
    }
    return ids;
  }, [issues, templateIssueIds]);

  const updateSchedule = useMutation({
    mutationFn: ({
      scheduleId,
      patch,
    }: {
      scheduleId: string;
      patch: { enabled?: boolean; expression?: string };
    }) =>
      taskCronsApi.updateSchedule(scheduleId, patch, selectedCompanyId ?? undefined),
    onSuccess: () => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.taskCrons.company(selectedCompanyId) });
    },
  });

  const agentName = useCallback((id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  }, [agents]);

  const { data: allProjects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const filtered = useMemo(() => {
    const sourceIssues = normalizedIssueSearch.length > 0 ? searchedIssues : issues;
    const filteredByControls = applyFilters(sourceIssues, viewState, recurringIssueIds, templateIssueIds);
    return sortIssues(filteredByControls, viewState);
  }, [issues, searchedIssues, viewState, normalizedIssueSearch, recurringIssueIds, templateIssueIds]);

  // Clear multi-selection when filtered list changes
  useEffect(() => {
    setRowSelection({});
  }, [filtered.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectAll = useCallback(() => {
    setRowSelection(Object.fromEntries(filtered.map((i) => [i.id, true])));
  }, [filtered]);

  const bulkUpdate = useCallback(async (data: Record<string, unknown>) => {
    setBulkUpdating(true);
    try {
      const promises = Array.from(selectedIds).map((id) =>
        issuesApi.update(id, data),
      );
      await Promise.all(promises);
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
      }
      clearSelection();
    } finally {
      setBulkUpdating(false);
    }
  }, [selectedIds, selectedCompanyId, queryClient, clearSelection]);

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(selectedCompanyId!),
    queryFn: () => issuesApi.listLabels(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const activeFilterCount = countActiveFilters(viewState);

  const upcomingSchedules = useMemo(() => {
    const now = Date.now();
    // When viewing inside a project, only show schedules linked to issues in this project
    const projectIssueIds = projectId ? new Set(issues.map((i) => i.id)) : null;
    return recurringSchedules
      .filter((s) => {
        if (!s.enabled || !s.nextTriggerAt || new Date(s.nextTriggerAt).getTime() <= now) return false;
        // If scoped to a project, only include schedules whose linked issue belongs to this project
        if (projectIssueIds) return s.issueId != null && projectIssueIds.has(s.issueId);
        return true;
      })
      .sort((a, b) => new Date(a.nextTriggerAt!).getTime() - new Date(b.nextTriggerAt!).getTime())
      .slice(0, 8);
  }, [recurringSchedules, projectId, issues]);

  const activeIssues = useMemo(() => filtered.filter((i) => !pastStatuses.has(i.status)), [filtered]);
  const pastIssues = useMemo(() => filtered.filter((i) => pastStatuses.has(i.status)), [filtered]);

  // Keyboard triage state
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const issueRowRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [filtered]);

  const groupedContent = useMemo(() => {
    if (viewState.groupBy === "none") {
      return [{ key: "__all", label: null as string | null, items: filtered }];
    }
    if (viewState.groupBy === "status") {
      const groups = groupBy(filtered, (i) => i.status);
      return statusOrder
        .filter((s) => groups[s]?.length)
        .map((s) => ({ key: s, label: statusLabel(s), items: groups[s]! }));
    }
    if (viewState.groupBy === "priority") {
      const groups = groupBy(filtered, (i) => i.priority);
      return priorityOrder
        .filter((p) => groups[p]?.length)
        .map((p) => ({ key: p, label: statusLabel(p), items: groups[p]! }));
    }
    if (viewState.groupBy === "recurring") {
      const recurring = filtered.filter((i) => recurringIssueIds.has(i.id));
      const oneOff = filtered.filter((i) => !recurringIssueIds.has(i.id));
      const result: { key: string; label: string | null; items: typeof filtered }[] = [];
      if (recurring.length) result.push({ key: "recurring", label: "Recurring", items: recurring });
      if (oneOff.length) result.push({ key: "one-off", label: "One-off", items: oneOff });
      return result;
    }
    // assignee
    const groups = groupBy(filtered, (i) => i.assigneeAgentId ?? "__unassigned");
    return Object.keys(groups).map((key) => ({
      key,
      label: key === "__unassigned" ? "Unassigned" : (agentName(key) ?? key.slice(0, 8)),
      items: groups[key]!,
    }));
  }, [filtered, viewState.groupBy, agents, recurringIssueIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const newIssueDefaults = (groupKey?: string) => {
    const defaults: Record<string, string> = {};
    if (projectId) defaults.projectId = projectId;
    if (groupKey) {
      if (viewState.groupBy === "status") defaults.status = groupKey;
      else if (viewState.groupBy === "priority") defaults.priority = groupKey;
      else if (viewState.groupBy === "assignee" && groupKey !== "__unassigned") defaults.assigneeAgentId = groupKey;
    }
    return defaults;
  };

  // Compute flat visible issue list matching render order for keyboard navigation
  const flatVisibleIssues = useMemo(() => {
    if (viewState.viewMode !== "list") return [];
    if (viewState.groupBy === "none") {
      // Active section is open by default, past is closed by default
      const activeOpen = !viewState.collapsedGroups.includes("__active");
      const pastOpen = viewState.collapsedGroups.includes("__past"); // inverted: defaultOpen=false
      const result: Issue[] = [];
      if (activeOpen) result.push(...activeIssues);
      if (pastOpen) result.push(...pastIssues);
      return result;
    }
    // Grouped view
    const result: Issue[] = [];
    for (const group of groupedContent) {
      const inCollapsed = viewState.collapsedGroups.includes(group.key);
      const effectiveOpen = !inCollapsed; // defaultOpen=true for grouped
      if (effectiveOpen) result.push(...group.items);
    }
    return result;
  }, [viewState.viewMode, viewState.groupBy, viewState.collapsedGroups, activeIssues, pastIssues, groupedContent]);

  // Scroll selected issue into view
  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex >= flatVisibleIssues.length) return;
    const issue = flatVisibleIssues[selectedIndex];
    const el = issueRowRefs.current.get(issue.id);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex, flatVisibleIssues]);

  useIssueTriageKeyboard({
    issueCount: flatVisibleIssues.length,
    selectedIndex,
    onSelectIndex: setSelectedIndex,
    onOpen: useCallback((index: number) => {
      const issue = flatVisibleIssues[index];
      if (issue) navigate(`/issues/${issue.identifier ?? issue.id}`, { state: issueLinkState });
    }, [flatVisibleIssues, navigate, issueLinkState]),
    onSetStatus: useCallback((index: number, status: string) => {
      const issue = flatVisibleIssues[index];
      if (issue) onUpdateIssue(issue.id, { status });
    }, [flatVisibleIssues, onUpdateIssue]),
    onOpenAssignee: useCallback((index: number) => {
      const issue = flatVisibleIssues[index];
      if (issue) setAssigneePickerIssueId(issue.id);
    }, [flatVisibleIssues]),
    enabled: viewState.viewMode === "list",
  });

  const scheduleDraftValue = (schedule: TaskCronSchedule) =>
    recurringDrafts[schedule.id] ?? schedule.expression;

  // Context object passed to TanStack Table meta — cell renderers read from this
  const ctx: IssueColumnContext = {
    issueLinkState,
    onUpdateIssue,
    agents,
    agentName,
    liveIssueIds,
    failedRunMap,
    retryingIssueId,
    onRetry: (agentId: string, issueId: string) => retryMutation.mutate({ agentId, issueId }),
    recurringIssueIds,
    templateIssueIds,
    spawnedFromTemplateIds,
    recurringByIssueId,
    recurringPickerIssueId,
    setRecurringPickerIssueId,
    scheduleDraftValue,
    onUpdateSchedule: (args) => updateSchedule.mutate(args),
    isUpdatingSchedule: updateSchedule.isPending,
    setRecurringDrafts,
    assigneePickerIssueId,
    setAssigneePickerIssueId,
    assigneeSearch,
    setAssigneeSearch,
    projectPickerIssueId,
    setProjectPickerIssueId,
    projectSearch,
    setProjectSearch,
    allProjects,
    kbSelectedIssueId: flatVisibleIssues[selectedIndex]?.id ?? null,
    issueRowRefs,
    hasSelection,
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button size="sm" variant="outline" onClick={() => openNewIssue(newIssueDefaults())}>
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">New Issue</span>
          </Button>
          <div className="relative w-48 sm:w-64 md:w-80">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={issueSearch}
              onChange={(e) => {
                setIssueSearch(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              placeholder="Search issues..."
              className="pl-7 text-xs sm:text-sm"
              aria-label="Search issues"
            />
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <Select
            value={viewState.showTemplates ? (viewState.recurringFilter === "recurring_only" ? "recurring_only" : "all_with_templates") : viewState.recurringFilter === "recurring_only" ? "recurring_only" : "all"}
            onValueChange={(value) => {
              if (value === "all") updateView({ recurringFilter: "all", showTemplates: false });
              else if (value === "all_with_templates") updateView({ recurringFilter: "all", showTemplates: true });
              else if (value === "recurring_only") updateView({ recurringFilter: "recurring_only", showTemplates: true });
            }}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All issues</SelectItem>
              <SelectItem value="all_with_templates">Include templates</SelectItem>
              <SelectItem value="recurring_only">Recurring only</SelectItem>
            </SelectContent>
          </Select>

          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden mr-1">
            <button
              className={`p-1.5 transition-colors ${viewState.viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => updateView({ viewMode: "list" })}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              className={`p-1.5 transition-colors ${viewState.viewMode === "board" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => updateView({ viewMode: "board" })}
              title="Board view"
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={`text-xs ${activeFilterCount > 0 ? "text-blue-600 dark:text-blue-400" : ""}`}>
                <Filter className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                <span className="hidden sm:inline">{activeFilterCount > 0 ? `Filters: ${activeFilterCount}` : "Filter"}</span>
                {activeFilterCount > 0 && (
                  <span className="sm:hidden text-[10px] font-medium ml-0.5">{activeFilterCount}</span>
                )}
                {activeFilterCount > 0 && (
                  <X
                    className="h-3 w-3 ml-1 hidden sm:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateView({ statuses: [], priorities: [], assignees: [], labels: [], recurringFilter: "all", showTemplates: false });
                    }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(480px,calc(100vw-2rem))] p-0">
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        updateView({
                          statuses: [],
                          priorities: [],
                          assignees: [],
                          labels: [],
                          recurringFilter: "all",
                          showTemplates: false,
                        })
                      }
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Quick filters */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Quick filters</span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickFilterPresets.map((preset) => {
                      const isActive = arraysEqual(viewState.statuses, preset.statuses);
                      return (
                        <button
                          key={preset.label}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                          }`}
                          onClick={() => updateView({ statuses: isActive ? [] : [...preset.statuses] })}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-border" />

                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Scope</span>
                  <label className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                    <Checkbox
                      checked={viewState.recurringFilter === "recurring_only"}
                      onCheckedChange={(checked) =>
                        updateView({ recurringFilter: checked ? "recurring_only" : "all" })
                      }
                    />
                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">Recurring only</span>
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                    <Checkbox
                      checked={viewState.showTemplates}
                      onCheckedChange={(checked) =>
                        updateView({ showTemplates: !!checked })
                      }
                    />
                    <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">Show templates</span>
                  </label>
                </div>

                <div className="border-t border-border" />

                {/* Multi-column filter sections */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {/* Status */}
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <div className="space-y-0.5">
                      {statusOrder.map((s) => (
                        <label key={s} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                          <Checkbox
                            checked={viewState.statuses.includes(s)}
                            onCheckedChange={() => updateView({ statuses: toggleInArray(viewState.statuses, s) })}
                          />
                          <StatusIcon status={s} />
                          <span className="text-sm">{statusLabel(s)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Priority + Assignee stacked in right column */}
                  <div className="space-y-3">
                    {/* Priority */}
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Priority</span>
                      <div className="space-y-0.5">
                        {priorityOrder.map((p) => (
                          <label key={p} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                            <Checkbox
                              checked={viewState.priorities.includes(p)}
                              onCheckedChange={() => updateView({ priorities: toggleInArray(viewState.priorities, p) })}
                            />
                            <PriorityIcon priority={p} />
                            <span className="text-sm">{statusLabel(p)}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Assignee */}
                    {agents && agents.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Assignee</span>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto">
                          {agents.map((agent) => (
                            <label key={agent.id} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                              <Checkbox
                                checked={viewState.assignees.includes(agent.id)}
                                onCheckedChange={() => updateView({ assignees: toggleInArray(viewState.assignees, agent.id) })}
                              />
                              <span className="text-sm">{agent.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {labels && labels.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Labels</span>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto">
                          {labels.map((label) => (
                            <label key={label.id} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                              <Checkbox
                                checked={viewState.labels.includes(label.id)}
                                onCheckedChange={() => updateView({ labels: toggleInArray(viewState.labels, label.id) })}
                              />
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                              <span className="text-sm">{label.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort (list view only) */}
          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                  <span className="hidden sm:inline">Sort</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-0">
                <div className="p-2 space-y-0.5">
                  {([
                    ["status", "Status"],
                    ["priority", "Priority"],
                    ["title", "Title"],
                    ["created", "Created"],
                    ["updated", "Updated"],
                  ] as const).map(([field, label]) => (
                    <button
                      key={field}
                      className={`flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm ${
                        viewState.sortField === field ? "bg-accent/50 text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                      }`}
                      onClick={() => {
                        if (viewState.sortField === field) {
                          updateView({ sortDir: viewState.sortDir === "asc" ? "desc" : "asc" });
                        } else {
                          updateView({ sortField: field, sortDir: "asc" });
                        }
                      }}
                    >
                      <span>{label}</span>
                      {viewState.sortField === field && (
                        <span className="text-xs text-muted-foreground">
                          {viewState.sortDir === "asc" ? "\u2191" : "\u2193"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Group (list view only) */}
          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  <Layers className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                  <span className="hidden sm:inline">Group</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-0">
                <div className="p-2 space-y-0.5">
                  {([
                    ["status", "Status"],
                    ["priority", "Priority"],
                    ["assignee", "Assignee"],
                    ["recurring", "Recurring"],
                    ["none", "None"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      className={`flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm ${
                        viewState.groupBy === value ? "bg-accent/50 text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                      }`}
                      onClick={() => updateView({ groupBy: value })}
                    >
                      <span>{label}</span>
                      {viewState.groupBy === value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Keyboard shortcut hint */}
      {viewState.viewMode === "list" && !isLoading && filtered.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <Keyboard className="h-3 w-3" />
          <span>
            <kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">j</kbd>/<kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">k</kbd> navigate
            {" "}<kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">Enter</kbd> open
            {" "}<kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">1</kbd>-<kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">5</kbd> status
            {" "}<kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">a</kbd> assign
            {" "}<kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">Esc</kbd> deselect
          </span>
        </div>
      )}

      {!isLoading && upcomingSchedules.length > 0 && (
        <Collapsible>
          <div className="flex items-center py-1.5 pl-1 pr-3">
            <CollapsibleTrigger className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold uppercase tracking-wide">
                Upcoming
              </span>
              <span className="text-xs text-muted-foreground font-normal normal-case ml-1">
                ({upcomingSchedules.length})
              </span>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="border border-border rounded-lg mb-4 divide-y divide-border">
              {upcomingSchedules.map((schedule) => {
                const linkedIssue = schedule.issueId
                  ? issues.find((i) => i.id === schedule.issueId)
                  : null;
                const assignedAgent = agents?.find((a) => a.id === schedule.agentId);
                return (
                  <div key={schedule.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{schedule.name}</span>
                        {linkedIssue && (
                          <Link
                            to={`/issues/${linkedIssue.identifier ?? linkedIssue.id}`}
                            className="text-xs text-muted-foreground hover:text-foreground truncate font-mono"
                          >
                            {linkedIssue.identifier ?? linkedIssue.id.slice(0, 8)}
                          </Link>
                        )}
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] shrink-0",
                          schedule.issueMode === "create_new"
                            ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        )}>
                          {schedule.issueMode === "create_new" ? "new" : schedule.issueMode === "reopen_existing" ? "reopen" : "reuse"}
                        </span>
                      </div>
                      {linkedIssue?.description && (
                        <span className="line-clamp-1 text-[11px] text-muted-foreground mt-0.5 block">
                          {linkedIssue.description.replace(/[\n\r]+/g, " ").slice(0, 120)}
                        </span>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        {assignedAgent && <Identity name={assignedAgent.name} size="xs" />}
                        {!assignedAgent && <span>{schedule.agentId.slice(0, 8)}</span>}
                        <span>&middot;</span>
                        <span className="font-mono">{schedule.expression}</span>
                        <span>&middot;</span>
                        <span className="tabular-nums">{formatDateTime(schedule.nextTriggerAt!)}</span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground shrink-0 tabular-nums mt-0.5">
                      {timeUntil(schedule.nextTriggerAt!)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {isLoading && <PageSkeleton variant="issues-list" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!isLoading && filtered.length === 0 && viewState.viewMode === "list" && (
        <EmptyState
          icon={CircleDot}
          message="No issues match the current filters or search."
          description="Try broadening your search or adjusting filters to find what you're looking for."
          action="Create Issue"
          onAction={() => openNewIssue(newIssueDefaults())}
        />
      )}

      {viewState.viewMode === "board" ? (
        <KanbanBoard
          issues={filtered}
          agents={agents}
          liveIssueIds={liveIssueIds}
          recurringIssueIds={recurringIssueIds}
          templateIssueIds={templateIssueIds}
          spawnedFromTemplateIds={spawnedFromTemplateIds}
          onUpdateIssue={onUpdateIssue}
        />
      ) : (
        <>
          {viewState.groupBy === "none" ? (
            <>
              {activeIssues.length > 0 && (
                <IssueSection
                  sectionKey="__active"
                  label="Active"
                  icon={<Zap className="h-3.5 w-3.5 text-muted-foreground" />}
                  items={activeIssues}
                  defaultOpen
                  collapsedGroups={viewState.collapsedGroups}
                  onToggle={(key, open) => updateView({
                    collapsedGroups: open
                      ? viewState.collapsedGroups.filter((k) => k !== key)
                      : [...viewState.collapsedGroups, key],
                  })}
                  columns={issueColumns}
                  meta={ctx}
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                />
              )}
              {pastIssues.length > 0 && (
                <IssueSection
                  sectionKey="__past"
                  label="Past"
                  icon={<History className="h-3.5 w-3.5 text-muted-foreground" />}
                  items={pastIssues}
                  defaultOpen={false}
                  collapsedGroups={viewState.collapsedGroups}
                  onToggle={(key, open) => updateView({
                    collapsedGroups: open
                      ? [...viewState.collapsedGroups, key]
                      : viewState.collapsedGroups.filter((k) => k !== key),
                  })}
                  columns={issueColumns}
                  meta={ctx}
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                />
              )}
            </>
          ) : (
            groupedContent.map((group) => (
              <IssueSection
                key={group.key}
                sectionKey={group.key}
                label={group.label}
                items={group.items}
                defaultOpen
                collapsedGroups={viewState.collapsedGroups}
                onToggle={(key, open) => updateView({
                  collapsedGroups: open
                    ? viewState.collapsedGroups.filter((k) => k !== key)
                    : [...viewState.collapsedGroups, key],
                })}
                columns={issueColumns}
                meta={ctx}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                onAdd={() => openNewIssue(newIssueDefaults(group.key))}
              />
            ))
          )}
        </>
      )}

      {/* Floating bulk action bar */}
      {hasSelection && viewState.viewMode === "list" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-lg px-4 py-2.5">
            {/* Selection info */}
            <div className="flex items-center gap-2 pr-3 border-r border-border">
              <button
                className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                onClick={() => {
                  if (selectedIds.size === filtered.length) clearSelection();
                  else selectAll();
                }}
                title={selectedIds.size === filtered.length ? "Deselect all" : "Select all"}
              >
                {selectedIds.size === filtered.length ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <MinusSquare className="h-4 w-4" />
                )}
                {selectedIds.size} selected
              </button>
            </div>

            {/* Status picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs gap-1.5" disabled={bulkUpdating}>
                  <CircleDot className="h-3.5 w-3.5" />
                  Status
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="center" side="top">
                <div className="space-y-0.5">
                  {statusOrder.map((s) => (
                    <button
                      key={s}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left"
                      onClick={() => bulkUpdate({ status: s })}
                    >
                      <StatusIcon status={s} />
                      <span>{statusLabel(s)}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Assignee picker */}
            <Popover
              open={bulkAssigneeOpen}
              onOpenChange={(open) => {
                setBulkAssigneeOpen(open);
                if (!open) setBulkAssigneeSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs gap-1.5" disabled={bulkUpdating}>
                  <User className="h-3.5 w-3.5" />
                  Assignee
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="center" side="top">
                <input
                  className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                  placeholder="Search agents..."
                  value={bulkAssigneeSearch}
                  onChange={(e) => setBulkAssigneeSearch(e.target.value)}
                  autoFocus
                />
                <div className="max-h-48 overflow-y-auto overscroll-contain">
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
                    onClick={() => {
                      bulkUpdate({ assigneeAgentId: null, assigneeUserId: null });
                      setBulkAssigneeOpen(false);
                    }}
                  >
                    No assignee
                  </button>
                  {(agents ?? [])
                    .filter((agent) => {
                      if (!bulkAssigneeSearch.trim()) return true;
                      return agent.name.toLowerCase().includes(bulkAssigneeSearch.toLowerCase());
                    })
                    .map((agent) => (
                      <button
                        key={agent.id}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left"
                        onClick={() => {
                          bulkUpdate({ assigneeAgentId: agent.id, assigneeUserId: null });
                          setBulkAssigneeOpen(false);
                        }}
                      >
                        <Identity name={agent.name} size="sm" className="min-w-0" />
                      </button>
                    ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Project picker */}
            <Popover
              open={bulkProjectOpen}
              onOpenChange={(open) => {
                setBulkProjectOpen(open);
                if (!open) setBulkProjectSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs gap-1.5" disabled={bulkUpdating}>
                  <FolderKanban className="h-3.5 w-3.5" />
                  Project
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="center" side="top">
                <input
                  className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                  placeholder="Search projects..."
                  value={bulkProjectSearch}
                  onChange={(e) => setBulkProjectSearch(e.target.value)}
                  autoFocus
                />
                <div className="max-h-48 overflow-y-auto overscroll-contain">
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
                    onClick={() => {
                      bulkUpdate({ projectId: null });
                      setBulkProjectOpen(false);
                    }}
                  >
                    No project
                  </button>
                  {(allProjects ?? [])
                    .filter((proj) => {
                      if (!bulkProjectSearch.trim()) return true;
                      return proj.name.toLowerCase().includes(bulkProjectSearch.toLowerCase());
                    })
                    .map((proj) => (
                      <button
                        key={proj.id}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left"
                        onClick={() => {
                          bulkUpdate({ projectId: proj.id });
                          setBulkProjectOpen(false);
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

            {/* Loading indicator */}
            {bulkUpdating && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}

            {/* Cancel */}
            <div className="pl-1 border-l border-border">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={clearSelection}
                disabled={bulkUpdating}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reusable collapsible section for issue groups ── */

function IssueSection({
  sectionKey,
  label,
  icon,
  items,
  defaultOpen = true,
  collapsedGroups,
  onToggle,
  columns,
  meta,
  rowSelection,
  onRowSelectionChange,
  onAdd,
}: {
  sectionKey: string;
  label: string | null;
  icon?: React.ReactNode;
  items: Issue[];
  defaultOpen?: boolean;
  collapsedGroups: string[];
  onToggle: (key: string, open: boolean) => void;
  columns: ColumnDef<Issue>[];
  meta: IssueColumnContext;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onAdd?: () => void;
}) {
  const navigate = useNavigate();
  const inCollapsed = collapsedGroups.includes(sectionKey);
  const effectiveOpen = defaultOpen ? !inCollapsed : inCollapsed;

  const table = useReactTable({
    data: items,
    columns,
    state: { rowSelection },
    onRowSelectionChange,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    meta: meta as any,
  });

  return (
    <Collapsible
      open={effectiveOpen}
      onOpenChange={(open) => onToggle(sectionKey, open)}
    >
      {label && (
        <div className="flex items-center py-1.5 pl-1 pr-3">
          <CollapsibleTrigger className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
            {icon}
            <span className="text-sm font-semibold uppercase tracking-wide">
              {label}
            </span>
            <span className="text-xs text-muted-foreground font-normal normal-case">
              ({items.length})
            </span>
          </CollapsibleTrigger>
          {onAdd && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto text-muted-foreground"
              onClick={onAdd}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      <CollapsibleContent>
        {/* Mobile: card list (sm:hidden) */}
        <div className="sm:hidden border border-border rounded-lg divide-y divide-border mb-4">
          {table.getRowModel().rows.map((row) => (
            <IssueCard
              key={row.id}
              issue={row.original}
              isChecked={row.getIsSelected()}
              hasSelection={meta.hasSelection}
              onToggleSelect={() => row.toggleSelected()}
              isKbSelected={row.id === meta.kbSelectedIssueId}
              liveIssueIds={meta.liveIssueIds}
              failedRunMap={meta.failedRunMap}
              recurringIssueIds={meta.recurringIssueIds}
              templateIssueIds={meta.templateIssueIds}
              spawnedFromTemplateIds={meta.spawnedFromTemplateIds}
              onUpdateIssue={meta.onUpdateIssue}
              issueLinkState={meta.issueLinkState}
            />
          ))}
        </div>

        {/* Desktop: HTML table (hidden sm:block) */}
        <div className="hidden sm:block border border-border rounded-lg mb-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm border-collapse">
            <colgroup>
              {table.getAllColumns().map((column) => (
                <col
                  key={column.id}
                  style={column.id !== "title" ? { width: column.getSize() } : undefined}
                />
              ))}
            </colgroup>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border bg-muted/30">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="h-9 px-2 text-left align-middle text-[11px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap select-none"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isKbSelected = row.id === meta.kbSelectedIssueId;
                const isChecked = row.getIsSelected();
                return (
                  <tr
                    key={row.id}
                    ref={(el) => {
                      if (el) meta.issueRowRefs.current.set(row.id, el);
                      else meta.issueRowRefs.current.delete(row.id);
                    }}
                    className={cn(
                      "group/row border-b border-border last:border-b-0 transition-colors cursor-pointer hover:bg-accent/50",
                      isKbSelected && "ring-2 ring-inset ring-primary bg-accent/60",
                      isChecked && "bg-primary/5",
                    )}
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest('button,a,[role="button"]')) {
                        const issue = row.original;
                        navigate(`/issues/${issue.identifier ?? issue.id}`, { state: meta.issueLinkState });
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-2 py-1.5 align-middle text-sm">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
