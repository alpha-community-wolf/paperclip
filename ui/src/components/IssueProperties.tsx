import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import type { Issue, IssueType } from "@paperclipai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../lib/recent-assignees";
import { extractProviderIdWithFallback } from "../lib/model-utils";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { formatDate, cn, projectUrl, activityLevel, activityConfig } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import { resolveEffectiveReviewBundleMode } from "../lib/review-bundles";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { User, Hexagon, ArrowUpRight, Tag, Plus, Trash2, ListChecks, Map, Search, Settings2 } from "lucide-react";
import { isWorkflowManagedIssue } from "@/lib/issue-flow-ui";
import { AgentIcon } from "./AgentIconPicker";

// TODO(issue-worktree-support): re-enable this UI once the workflow is ready to ship.
const SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI = false;

const ADAPTER_OVERRIDE_TYPES = new Set(["claude_local", "codex_local", "opencode_local"]);

const ADAPTER_LABELS: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  opencode_local: "OpenCode",
};

const THINKING_EFFORT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  claude_local: [
    { value: "", label: "Default" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  codex_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  opencode_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "max", label: "Max" },
  ],
};

function getThinkingKey(adapterType: string): string {
  if (adapterType === "codex_local") return "modelReasoningEffort";
  if (adapterType === "opencode_local") return "variant";
  return "effort";
}

function cycleIssueType(current: IssueType): IssueType {
  if (current === "task") return "plan";
  if (current === "plan") return "explore";
  return "task";
}

interface IssuePropertiesProps {
  issue: Issue;
  onUpdate: (data: Record<string, unknown>) => void;
  inline?: boolean;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Renders a Popover on desktop, or an inline collapsible section on mobile (inline mode). */
function PropertyPicker({
  inline,
  label,
  open,
  onOpenChange,
  triggerContent,
  triggerClassName,
  popoverClassName,
  popoverAlign = "end",
  extra,
  children,
}: {
  inline?: boolean;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerContent: React.ReactNode;
  triggerClassName?: string;
  popoverClassName?: string;
  popoverAlign?: "start" | "center" | "end";
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const btnCn = cn(
    "inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors",
    triggerClassName,
  );

  if (inline) {
    return (
      <div>
        <PropertyRow label={label}>
          <button className={btnCn} onClick={() => onOpenChange(!open)}>
            {triggerContent}
          </button>
          {extra}
        </PropertyRow>
        {open && (
          <div className={cn("rounded-md border border-border bg-popover p-1 mb-2", popoverClassName)}>
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <PropertyRow label={label}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button className={btnCn}>{triggerContent}</button>
        </PopoverTrigger>
        <PopoverContent className={cn("p-1", popoverClassName)} align={popoverAlign} collisionPadding={16}>
          {children}
        </PopoverContent>
      </Popover>
      {extra}
    </PropertyRow>
  );
}

export function IssueProperties({ issue, onUpdate, inline }: IssuePropertiesProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const companyId = issue.companyId ?? selectedCompanyId;
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [reviewModeOpen, setReviewModeOpen] = useState(false);
  const [reviewerOpen, setReviewerOpen] = useState(false);
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [approverOpen, setApproverOpen] = useState(false);
  const [approverSearch, setApproverSearch] = useState("");
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [thinkingOpen, setThinkingOpen] = useState(false);

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId;

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId!),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId!),
    queryFn: () => projectsApi.list(companyId!),
    enabled: !!companyId,
  });
  const { orderedProjects } = useProjectOrder({
    projects: projects ?? [],
    companyId,
    userId: currentUserId,
  });

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(companyId!),
    queryFn: () => issuesApi.listLabels(companyId!),
    enabled: !!companyId,
  });

  const createLabel = useMutation({
    mutationFn: (data: { name: string; color: string }) => issuesApi.createLabel(companyId!, data),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(companyId!) });
      onUpdate({ labelIds: [...(issue.labelIds ?? []), created.id] });
      setNewLabelName("");
    },
  });

  const deleteLabel = useMutation({
    mutationFn: (labelId: string) => issuesApi.deleteLabel(labelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(companyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
    },
  });

  const toggleLabel = (labelId: string) => {
    const ids = issue.labelIds ?? [];
    const next = ids.includes(labelId)
      ? ids.filter((id) => id !== labelId)
      : [...ids, labelId];
    onUpdate({ labelIds: next });
  };

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    const agent = agents.find((a) => a.id === id);
    return agent?.name ?? id.slice(0, 8);
  };

  const projectName = (id: string | null) => {
    if (!id) return id?.slice(0, 8) ?? "None";
    const project = orderedProjects.find((p) => p.id === id);
    return project?.name ?? id.slice(0, 8);
  };
  const currentProject = issue.projectId
    ? orderedProjects.find((project) => project.id === issue.projectId) ?? null
    : null;
  const currentProjectExecutionWorkspacePolicy = SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI
    ? currentProject?.executionWorkspacePolicy ?? null
    : null;
  const currentProjectReviewBundlePolicy = currentProject?.reviewBundlePolicy ?? null;
  const currentProjectReviewBundlesEnabled = currentProjectReviewBundlePolicy?.enabled === true;
  const currentProjectAllowReviewOverride = currentProjectReviewBundlePolicy?.allowIssueOverride ?? true;
  const reviewBundleMode = issue.reviewBundleMode ?? "inherit";
  const effectiveReviewBundle = resolveEffectiveReviewBundleMode({
    projectPolicy: currentProjectReviewBundlePolicy,
    issueMode: reviewBundleMode,
  });
  const effectiveReviewBundleMode = effectiveReviewBundle.mode;
  const effectiveReviewBundleSource = effectiveReviewBundle.source;
  const currentProjectSupportsExecutionWorkspace = Boolean(currentProjectExecutionWorkspacePolicy?.enabled);
  const usesIsolatedExecutionWorkspace = issue.executionWorkspaceSettings?.mode === "isolated"
    ? true
    : issue.executionWorkspaceSettings?.mode === "project_primary"
      ? false
      : currentProjectExecutionWorkspacePolicy?.defaultMode === "isolated";
  const projectLink = (id: string | null) => {
    if (!id) return null;
    const project = projects?.find((p) => p.id === id) ?? null;
    return project ? projectUrl(project) : `/projects/${id}`;
  };

  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [assigneeOpen]);
  const sortedAgents = useMemo(
    () => sortAgentsByRecency((agents ?? []).filter((a) => a.status !== "terminated"), recentAssigneeIds),
    [agents, recentAssigneeIds],
  );

  const assignee = issue.assigneeAgentId
    ? agents?.find((a) => a.id === issue.assigneeAgentId)
    : null;
  const userLabel = (userId: string | null | undefined) =>
    userId
      ? userId === "local-board"
        ? "Board"
        : currentUserId && userId === currentUserId
          ? "Me"
          : userId.slice(0, 5)
      : null;
  const assigneeUserLabel = userLabel(issue.assigneeUserId);
  const creatorUserLabel = userLabel(issue.createdByUserId);

  const reviewer = issue.reviewerAgentId ? agents?.find((a) => a.id === issue.reviewerAgentId) : null;
  const reviewerUserLabel = userLabel(issue.reviewerUserId);
  const approver = issue.approverAgentId ? agents?.find((a) => a.id === issue.approverAgentId) : null;
  const approverUserLabel = userLabel(issue.approverUserId);

  // Adapter details
  const assigneeAdapterType = assignee?.adapterType ?? null;
  const supportsAdapterOverrides = Boolean(assigneeAdapterType && ADAPTER_OVERRIDE_TYPES.has(assigneeAdapterType));
  const adapterLabel = assigneeAdapterType ? (ADAPTER_LABELS[assigneeAdapterType] ?? assigneeAdapterType) : null;
  const overrides = issue.assigneeAdapterOverrides;
  const currentAdapterConfig = (overrides?.adapterConfig ?? {}) as Record<string, unknown>;
  const currentModel = (currentAdapterConfig.model as string) ?? "";
  const currentThinkingKey = assigneeAdapterType ? getThinkingKey(assigneeAdapterType) : "effort";
  const currentThinking = (currentAdapterConfig[currentThinkingKey] as string) ?? "";
  const thinkingOptions = assigneeAdapterType ? (THINKING_EFFORT_OPTIONS[assigneeAdapterType] ?? []) : [];

  const { data: adapterModels } = useQuery({
    queryKey:
      companyId && assigneeAdapterType
        ? queryKeys.agents.adapterModels(companyId, assigneeAdapterType)
        : ["agents", "none", "adapter-models", "none"],
    queryFn: () => agentsApi.adapterModels(companyId!, assigneeAdapterType!),
    enabled: Boolean(companyId) && supportsAdapterOverrides,
  });

  const sortedModels = useMemo(
    () =>
      [...(adapterModels ?? [])].sort((a, b) => {
        const pa = extractProviderIdWithFallback(a.id);
        const pb = extractProviderIdWithFallback(b.id);
        const byProvider = pa.localeCompare(pb);
        if (byProvider !== 0) return byProvider;
        return a.id.localeCompare(b.id);
      }),
    [adapterModels],
  );

  const updateAdapterOverrides = (patch: Record<string, unknown>) => {
    const nextConfig = { ...currentAdapterConfig, ...patch };
    // Remove empty-string values (revert to default)
    for (const key of Object.keys(nextConfig)) {
      if (nextConfig[key] === "") delete nextConfig[key];
    }
    const nextOverrides = Object.keys(nextConfig).length > 0
      ? { ...(overrides ?? {}), adapterConfig: nextConfig }
      : overrides?.useProjectWorkspace != null
        ? { useProjectWorkspace: overrides.useProjectWorkspace }
        : null;
    onUpdate({ assigneeAdapterOverrides: nextOverrides });
  };

  const labelsTrigger = (issue.labels ?? []).length > 0 ? (
    <div className="flex items-center gap-1 flex-wrap">
      {(issue.labels ?? []).slice(0, 3).map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
          style={{
            borderColor: label.color,
            backgroundColor: `${label.color}22`,
            color: label.color,
          }}
        >
          {label.name}
        </span>
      ))}
      {(issue.labels ?? []).length > 3 && (
        <span className="text-xs text-muted-foreground">+{(issue.labels ?? []).length - 3}</span>
      )}
    </div>
  ) : (
    <>
      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">No labels</span>
    </>
  );

  const labelsContent = (
    <>
      <input
        className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
        placeholder="Search labels..."
        value={labelSearch}
        onChange={(e) => setLabelSearch(e.target.value)}
        autoFocus={!inline}
      />
      <div className="max-h-44 overflow-y-auto overscroll-contain space-y-0.5">
        {(labels ?? [])
          .filter((label) => {
            if (!labelSearch.trim()) return true;
            return label.name.toLowerCase().includes(labelSearch.toLowerCase());
          })
          .map((label) => {
            const selected = (issue.labelIds ?? []).includes(label.id);
            return (
              <div key={label.id} className="flex items-center gap-1">
                <button
                  className={cn(
                    "flex items-center gap-2 flex-1 px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left",
                    selected && "bg-accent"
                  )}
                  onClick={() => toggleLabel(label.id)}
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                  <span className="truncate">{label.name}</span>
                </button>
                <button
                  type="button"
                  className="p-1 text-muted-foreground hover:text-destructive rounded"
                  onClick={() => deleteLabel.mutate(label.id)}
                  title={`Delete ${label.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
      </div>
      <div className="mt-2 border-t border-border pt-2 space-y-1">
        <div className="flex items-center gap-1">
          <input
            className="h-7 w-7 p-0 rounded bg-transparent"
            type="color"
            value={newLabelColor}
            onChange={(e) => setNewLabelColor(e.target.value)}
          />
          <input
            className="flex-1 px-2 py-1.5 text-xs bg-transparent outline-none rounded placeholder:text-muted-foreground/50"
            placeholder="New label"
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
          />
        </div>
        <button
          className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-xs rounded border border-border hover:bg-accent/50 disabled:opacity-50"
          disabled={!newLabelName.trim() || createLabel.isPending}
          onClick={() =>
            createLabel.mutate({
              name: newLabelName.trim(),
              color: newLabelColor,
            })
          }
        >
          <Plus className="h-3 w-3" />
          {createLabel.isPending ? "Creating…" : "Create label"}
        </button>
      </div>
    </>
  );

  const assigneeTrigger = assignee ? (
    <Identity name={assignee.name} size="sm" />
  ) : assigneeUserLabel ? (
    <>
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm">{assigneeUserLabel}</span>
    </>
  ) : (
    <>
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Unassigned</span>
    </>
  );

  const assigneeContent = (
    <>
      <input
        className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
        placeholder="Search assignees..."
        value={assigneeSearch}
        onChange={(e) => setAssigneeSearch(e.target.value)}
        autoFocus={!inline}
      />
      <div className="max-h-48 overflow-y-auto overscroll-contain">
        <button
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
            !issue.assigneeAgentId && !issue.assigneeUserId && "bg-accent"
          )}
          onClick={() => { onUpdate({ assigneeAgentId: null, assigneeUserId: null }); setAssigneeOpen(false); }}
        >
          No assignee
        </button>
        {issue.createdByUserId && (
          <button
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
              issue.assigneeUserId === issue.createdByUserId && "bg-accent",
            )}
            onClick={() => {
              onUpdate({ assigneeAgentId: null, assigneeUserId: issue.createdByUserId });
              setAssigneeOpen(false);
            }}
          >
            <User className="h-3 w-3 shrink-0 text-muted-foreground" />
            {creatorUserLabel ? `Assign to ${creatorUserLabel === "Me" ? "me" : creatorUserLabel}` : "Assign to requester"}
          </button>
        )}
        {sortedAgents
          .filter((a) => {
            if (!assigneeSearch.trim()) return true;
            const q = assigneeSearch.toLowerCase();
            return a.name.toLowerCase().includes(q);
          })
          .map((a) => (
          <button
            key={a.id}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
              a.id === issue.assigneeAgentId && "bg-accent"
            )}
            onClick={() => { trackRecentAssignee(a.id); onUpdate({ assigneeAgentId: a.id, assigneeUserId: null }); setAssigneeOpen(false); }}
          >
            <AgentIcon icon={a.icon} className="shrink-0 h-3 w-3 text-muted-foreground" />
            {a.name}
          </button>
        ))}
      </div>
    </>
  );

  const projectTrigger = issue.projectId ? (
    <>
      <span
        className="shrink-0 h-3 w-3 rounded-sm"
        style={{ backgroundColor: orderedProjects.find((p) => p.id === issue.projectId)?.color ?? "#6366f1" }}
      />
      <span className="text-sm truncate">{projectName(issue.projectId)}</span>
    </>
  ) : (
    <>
      <Hexagon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">No project</span>
    </>
  );

  const projectContent = (
    <>
      <input
        className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
        placeholder="Search projects..."
        value={projectSearch}
        onChange={(e) => setProjectSearch(e.target.value)}
        autoFocus={!inline}
      />
      <div className="max-h-48 overflow-y-auto overscroll-contain">
        <button
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap",
            !issue.projectId && "bg-accent"
          )}
          onClick={() => {
              onUpdate({ projectId: null, executionWorkspaceSettings: null, reviewBundleMode: "inherit" });
            setProjectOpen(false);
          }}
        >
          No project
        </button>
        {orderedProjects
          .filter((p) => {
            if (!projectSearch.trim()) return true;
            const q = projectSearch.toLowerCase();
            return p.name.toLowerCase().includes(q);
          })
          .map((p) => (
          <button
            key={p.id}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap",
              p.id === issue.projectId && "bg-accent"
            )}
            onClick={() => {
              onUpdate({
                projectId: p.id,
                executionWorkspaceSettings: SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI && p.executionWorkspacePolicy?.enabled
                  ? { mode: p.executionWorkspacePolicy.defaultMode === "isolated" ? "isolated" : "project_primary" }
                  : null,
                reviewBundleMode: "inherit",
              });
              setProjectOpen(false);
            }}
          >
            <span
              className="shrink-0 h-3 w-3 rounded-sm"
              style={{ backgroundColor: p.color ?? "#6366f1" }}
            />
            {p.name}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PropertyRow label="Status">
          <StatusIcon
            status={issue.status}
            onChange={(status) => onUpdate({ status })}
            showLabel
          />
        </PropertyRow>

        <PropertyRow label="Priority">
          <PriorityIcon
            priority={issue.priority}
            onChange={(priority) => onUpdate({ priority })}
            showLabel
          />
        </PropertyRow>

        <PropertyRow label="Type">
          <button
            type="button"
            disabled={isWorkflowManagedIssue(issue)}
            title={
              isWorkflowManagedIssue(issue)
                ? "Type cannot be changed while this issue is part of a workflow."
                : "Cycle type: Build → Plan → Explore"
            }
            onClick={() => {
              if (isWorkflowManagedIssue(issue)) return;
              onUpdate({ type: cycleIssueType(issue.type) });
            }}
            className={cn(
              "flex items-center gap-1.5 text-xs text-foreground transition-colors",
              isWorkflowManagedIssue(issue)
                ? "opacity-60 cursor-not-allowed"
                : "hover:text-foreground/80",
            )}
          >
            {issue.type === "plan" ? (
              <>
                <Map className="h-3.5 w-3.5 text-violet-500" />
                <span>Plan</span>
              </>
            ) : issue.type === "explore" ? (
              <>
                <Search className="h-3.5 w-3.5 text-blue-500" />
                <span>Explore</span>
              </>
            ) : (
              <>
                <ListChecks className="h-3.5 w-3.5 text-emerald-600" />
                <span>Build</span>
              </>
            )}
          </button>
        </PropertyRow>

        <PropertyPicker
          inline={inline}
          label="Labels"
          open={labelsOpen}
          onOpenChange={(open) => { setLabelsOpen(open); if (!open) setLabelSearch(""); }}
          triggerContent={labelsTrigger}
          triggerClassName="min-w-0 max-w-full"
          popoverClassName="w-64"
        >
          {labelsContent}
        </PropertyPicker>

        <PropertyPicker
          inline={inline}
          label="Assignee"
          open={assigneeOpen}
          onOpenChange={(open) => { setAssigneeOpen(open); if (!open) setAssigneeSearch(""); }}
          triggerContent={assigneeTrigger}
          popoverClassName="w-52"
          extra={issue.assigneeAgentId ? (
            <Link
              to={`/agents/${issue.assigneeAgentId}`}
              className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ) : undefined}
        >
          {assigneeContent}
        </PropertyPicker>

        <PropertyPicker
          inline={inline}
          label="Project"
          open={projectOpen}
          onOpenChange={(open) => { setProjectOpen(open); if (!open) setProjectSearch(""); }}
          triggerContent={projectTrigger}
          triggerClassName="min-w-0 max-w-full"
          popoverClassName="w-fit min-w-[11rem]"
          extra={issue.projectId ? (
            <Link
              to={projectLink(issue.projectId)!}
              className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ) : undefined}
        >
          {projectContent}
        </PropertyPicker>

        {supportsAdapterOverrides && (
          <>
            <PropertyRow label="Adapter">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">{adapterLabel}</span>
            </PropertyRow>

            <PropertyPicker
              inline={inline}
              label="Model"
              open={modelOpen}
              onOpenChange={(open) => { setModelOpen(open); if (!open) setModelSearch(""); }}
              triggerContent={
                currentModel ? (
                  <span className="text-sm truncate">{currentModel}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">Default</span>
                )
              }
              triggerClassName="min-w-0 max-w-full"
              popoverClassName="w-72"
            >
              <>
                <input
                  className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                  placeholder="Search models..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  autoFocus={!inline}
                />
                <div className="max-h-48 overflow-y-auto overscroll-contain">
                  <button
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                      !currentModel && "bg-accent"
                    )}
                    onClick={() => { updateAdapterOverrides({ model: "" }); setModelOpen(false); }}
                  >
                    Default model
                  </button>
                  {sortedModels
                    .filter((m) => {
                      if (!modelSearch.trim()) return true;
                      const q = modelSearch.toLowerCase();
                      return m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q);
                    })
                    .map((m) => (
                      <button
                        key={m.id}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left",
                          m.id === currentModel && "bg-accent"
                        )}
                        onClick={() => { updateAdapterOverrides({ model: m.id }); setModelOpen(false); }}
                      >
                        <span className="truncate">{m.label}</span>
                      </button>
                    ))}
                </div>
              </>
            </PropertyPicker>

            <PropertyPicker
              inline={inline}
              label="Thinking"
              open={thinkingOpen}
              onOpenChange={setThinkingOpen}
              triggerContent={
                <span className="text-sm">
                  {thinkingOptions.find((o) => o.value === currentThinking)?.label ?? "Default"}
                </span>
              }
              popoverClassName="w-44"
            >
              <div className="space-y-0.5">
                {thinkingOptions.map((option) => (
                  <button
                    key={option.value || "default"}
                    className={cn(
                      "flex items-center w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                      currentThinking === option.value && "bg-accent"
                    )}
                    onClick={() => {
                      updateAdapterOverrides({ [currentThinkingKey]: option.value });
                      setThinkingOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </PropertyPicker>
          </>
        )}

        {currentProjectSupportsExecutionWorkspace && (
          <PropertyRow label="Workspace">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1.5 w-full">
              <div className="min-w-0">
                <div className="text-sm">
                  {usesIsolatedExecutionWorkspace ? "Isolated issue checkout" : "Project primary checkout"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Toggle whether this issue runs in its own execution workspace.
                </div>
              </div>
              <button
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  usesIsolatedExecutionWorkspace ? "bg-green-600" : "bg-muted",
                )}
                type="button"
                onClick={() =>
                  onUpdate({
                    executionWorkspaceSettings: {
                      mode: usesIsolatedExecutionWorkspace ? "project_primary" : "isolated",
                    },
                  })
                }
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                    usesIsolatedExecutionWorkspace ? "translate-x-4.5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          </PropertyRow>
        )}

        {(currentProjectReviewBundlesEnabled || reviewBundleMode !== "inherit") && (
          <PropertyPicker
            inline={inline}
            label="Review"
            open={reviewModeOpen}
            onOpenChange={setReviewModeOpen}
            triggerContent={(
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    effectiveReviewBundleMode === "required"
                      ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                      : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {effectiveReviewBundleMode === "required" ? "Review required" : "Review optional"}
                </span>
                <span className="text-xs text-muted-foreground">
                  via {effectiveReviewBundleSource}
                </span>
              </div>
            )}
            popoverClassName="w-56"
          >
            {currentProjectAllowReviewOverride ? (
              <div className="space-y-1">
                <button
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-accent/50",
                    reviewBundleMode === "inherit" && "bg-accent",
                  )}
                  onClick={() => {
                    onUpdate({ reviewBundleMode: "inherit" });
                    setReviewModeOpen(false);
                  }}
                >
                  <span>Use project default</span>
                  <span className="text-muted-foreground">
                    {currentProjectReviewBundlePolicy?.defaultMode === "required" ? "Required" : "Optional"}
                  </span>
                </button>
                <button
                  className={cn(
                    "flex w-full items-center rounded px-2 py-1.5 text-xs hover:bg-accent/50",
                    reviewBundleMode === "optional" && "bg-accent",
                  )}
                  onClick={() => {
                    onUpdate({ reviewBundleMode: "optional" });
                    setReviewModeOpen(false);
                  }}
                >
                  Optional for this issue
                </button>
                <button
                  className={cn(
                    "flex w-full items-center rounded px-2 py-1.5 text-xs hover:bg-accent/50",
                    reviewBundleMode === "required" && "bg-accent",
                  )}
                  onClick={() => {
                    onUpdate({ reviewBundleMode: "required" });
                    setReviewModeOpen(false);
                  }}
                >
                  Required for this issue
                </button>
              </div>
            ) : (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                This project enforces its default review mode for all issues.
              </p>
            )}
          </PropertyPicker>
        )}

        <PropertyPicker
          inline={inline}
          label="Reviewer"
          open={reviewerOpen}
          onOpenChange={(open) => { setReviewerOpen(open); if (!open) setReviewerSearch(""); }}
          triggerContent={
            reviewer ? (
              <Identity name={reviewer.name} size="sm" />
            ) : reviewerUserLabel ? (
              <>
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{reviewerUserLabel}</span>
              </>
            ) : (
              <>
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No reviewer</span>
              </>
            )
          }
          popoverClassName="w-52"
        >
          <>
            <input
              className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
              placeholder="Search agents..."
              value={reviewerSearch}
              onChange={(e) => setReviewerSearch(e.target.value)}
              autoFocus={!inline}
            />
            <div className="max-h-48 overflow-y-auto overscroll-contain">
              <button
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                  !issue.reviewerAgentId && !issue.reviewerUserId && "bg-accent"
                )}
                onClick={() => { onUpdate({ reviewerAgentId: null, reviewerUserId: null }); setReviewerOpen(false); }}
              >
                No reviewer
              </button>
              {sortedAgents
                .filter((a) => !reviewerSearch.trim() || a.name.toLowerCase().includes(reviewerSearch.toLowerCase()))
                .map((a) => (
                <button
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                    a.id === issue.reviewerAgentId && "bg-accent"
                  )}
                  onClick={() => { onUpdate({ reviewerAgentId: a.id, reviewerUserId: null }); setReviewerOpen(false); }}
                >
                  <AgentIcon icon={a.icon} className="shrink-0 h-3 w-3 text-muted-foreground" />
                  {a.name}
                </button>
              ))}
            </div>
          </>
        </PropertyPicker>

        <PropertyPicker
          inline={inline}
          label="Approver"
          open={approverOpen}
          onOpenChange={(open) => { setApproverOpen(open); if (!open) setApproverSearch(""); }}
          triggerContent={
            approver ? (
              <Identity name={approver.name} size="sm" />
            ) : approverUserLabel ? (
              <>
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{approverUserLabel}</span>
              </>
            ) : (
              <>
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No approver</span>
              </>
            )
          }
          popoverClassName="w-52"
        >
          <>
            <input
              className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
              placeholder="Search agents..."
              value={approverSearch}
              onChange={(e) => setApproverSearch(e.target.value)}
              autoFocus={!inline}
            />
            <div className="max-h-48 overflow-y-auto overscroll-contain">
              <button
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                  !issue.approverAgentId && !issue.approverUserId && "bg-accent"
                )}
                onClick={() => { onUpdate({ approverAgentId: null, approverUserId: null }); setApproverOpen(false); }}
              >
                No approver
              </button>
              {sortedAgents
                .filter((a) => !approverSearch.trim() || a.name.toLowerCase().includes(approverSearch.toLowerCase()))
                .map((a) => (
                <button
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                    a.id === issue.approverAgentId && "bg-accent"
                  )}
                  onClick={() => { onUpdate({ approverAgentId: a.id, approverUserId: null }); setApproverOpen(false); }}
                >
                  <AgentIcon icon={a.icon} className="shrink-0 h-3 w-3 text-muted-foreground" />
                  {a.name}
                </button>
              ))}
            </div>
          </>
        </PropertyPicker>

        {issue.parentId && (
          <PropertyRow label="Parent">
            <Link
              to={`/issues/${issue.ancestors?.[0]?.identifier ?? issue.parentId}`}
              className="text-sm hover:underline"
            >
              {issue.ancestors?.[0]?.title ?? issue.parentId.slice(0, 8)}
            </Link>
          </PropertyRow>
        )}

        {issue.requestDepth > 0 && (
          <PropertyRow label="Depth">
            <span className="text-sm font-mono">{issue.requestDepth}</span>
          </PropertyRow>
        )}
      </div>

      <Separator />

      <div className="space-y-1">
        {issue.startedAt && (
          <PropertyRow label="Started">
            <span className="text-sm">{formatDate(issue.startedAt)}</span>
          </PropertyRow>
        )}
        {issue.completedAt && (
          <PropertyRow label="Completed">
            <span className="text-sm">{formatDate(issue.completedAt)}</span>
          </PropertyRow>
        )}
        <PropertyRow label="Created">
          <span className="text-sm">{formatDate(issue.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label="Updated">
          {(() => {
            const level = activityLevel(issue.updatedAt);
            const config = activityConfig[level];
            return (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", {
                  "bg-orange-500": level === "hot",
                  "bg-yellow-500 dark:bg-yellow-400": level === "warm",
                  "bg-blue-400": level === "cold",
                  "bg-muted-foreground/40": level === "stale",
                })} />
                <span>{timeAgo(issue.updatedAt)}</span>
                <span className={cn("text-xs", config.className)}>({config.label})</span>
              </span>
            );
          })()}
        </PropertyRow>
      </div>
    </div>
  );
}
