import { useState, useEffect, useRef, useCallback, useMemo, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { queryKeys } from "../../lib/queryKeys";
import { useProjectOrder } from "../../hooks/useProjectOrder";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../../lib/recent-assignees";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  CircleDot,
  Minus,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Tag,
  Calendar,
  Clock3,
  Paperclip,
  Loader2,
  Settings2,
  ListChecks,
  Map,
  Search,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { extractProviderIdWithFallback } from "../../lib/model-utils";
import { issueStatusText, issueStatusTextDefault, priorityColor, priorityColorDefault } from "../../lib/status-colors";
import { cronPresetOptions } from "../../lib/cron-presets";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "../MarkdownEditor";
import { AgentIcon } from "../AgentIconPicker";
import { InlineEntitySelector, type InlineEntityOption } from "../InlineEntitySelector";
import {
  DEBOUNCE_MS,
  SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI,
  type IssueDraft,
  ISSUE_THINKING_EFFORT_OPTIONS,
  ISSUE_OVERRIDE_ADAPTER_TYPES,
  buildAssigneeAdapterOverrides,
  createDraftStorage,
  scopedQueryKey,
  type IssueCreateDefaults,
} from "./shared";
import type { IssueCreateClients } from "./clients";

export interface IssueCreateFormBodyProps {
  variant: "dialog" | "mini-app";
  cacheScope: "board" | "mini-app";
  companyId: string | null;
  active: boolean;
  projectOrderUserId: string | null | undefined;
  clients: IssueCreateClients;
  draftKey: string;
  defaults: IssueCreateDefaults;
  expanded: boolean;
  onSuccess: (issue: Issue) => void;
  onDiscard?: () => void;
  /** When true, host UI should block closing (e.g. dialog dismiss while mutation runs). */
  onMutationBusyChange?: (busy: boolean) => void;
}

const statuses = [
  { value: "backlog", label: "Backlog", color: issueStatusText.backlog ?? issueStatusTextDefault },
  { value: "todo", label: "Todo", color: issueStatusText.todo ?? issueStatusTextDefault },
  { value: "in_progress", label: "In Progress", color: issueStatusText.in_progress ?? issueStatusTextDefault },
  { value: "in_review", label: "In Review", color: issueStatusText.in_review ?? issueStatusTextDefault },
  { value: "done", label: "Done", color: issueStatusText.done ?? issueStatusTextDefault },
];

const priorities = [
  { value: "critical", label: "Critical", icon: AlertTriangle, color: priorityColor.critical ?? priorityColorDefault },
  { value: "high", label: "High", icon: ArrowUp, color: priorityColor.high ?? priorityColorDefault },
  { value: "medium", label: "Medium", icon: Minus, color: priorityColor.medium ?? priorityColorDefault },
  { value: "low", label: "Low", icon: ArrowDown, color: priorityColor.low ?? priorityColorDefault },
];

const issueTypes = [
  { value: "task", label: "Build", icon: ListChecks },
  { value: "plan", label: "Plan", icon: Map },
  { value: "explore", label: "Explore", icon: Search },
] as const;

export function IssueCreateFormBody({
  variant,
  cacheScope,
  companyId,
  active,
  projectOrderUserId,
  clients,
  draftKey,
  defaults,
  expanded,
  onSuccess,
  onDiscard,
  onMutationBusyChange,
}: IssueCreateFormBodyProps) {
  const { loadDraft, saveDraft, clearDraft } = useMemo(() => createDraftStorage(draftKey), [draftKey]);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"task" | "plan" | "explore">("task");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeOptionsOpen, setAssigneeOptionsOpen] = useState(false);
  const [assigneeModelOverride, setAssigneeModelOverride] = useState("");
  const [assigneeThinkingEffort, setAssigneeThinkingEffort] = useState("");
  const [assigneeChrome, setAssigneeChrome] = useState(false);
  const [useIsolatedExecutionWorkspace, setUseIsolatedExecutionWorkspace] = useState(false);
  const [reviewerId, setReviewerId] = useState("");
  const [approverId, setApproverId] = useState("");
  const [reviewBundleMode, setReviewBundleMode] = useState<"inherit" | "optional" | "required">("inherit");
  const [recurringSectionOpen, setRecurringSectionOpen] = useState(false);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringName, setRecurringName] = useState("");
  const [recurringExpression, setRecurringExpression] = useState("0 9 * * 1-5");
  const [recurringTimezone, setRecurringTimezone] = useState("UTC");
  const [recurringIssueMode, setRecurringIssueMode] = useState<"create_new" | "reuse_existing" | "reopen_existing">("reopen_existing");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executionWorkspaceDefaultProjectId = useRef<string | null>(null);
  const prevCompanyIdRef = useRef<string | null>(null);
  const handleSubmitRef = useRef<(() => void) | null>(null);

  // Popover states
  const [typeOpen, setTypeOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const assigneeSelectorRef = useRef<HTMLButtonElement | null>(null);
  const projectSelectorRef = useRef<HTMLButtonElement | null>(null);

  const { data: agents } = useQuery({
    queryKey: scopedQueryKey(cacheScope, queryKeys.agents.list(companyId!)),
    queryFn: () => clients.listAgents(companyId!),
    enabled: !!companyId && active,
  });

  const { data: workflowTemplates } = useQuery({
    queryKey: scopedQueryKey(cacheScope, queryKeys.workflowTemplates.list(companyId!)),
    queryFn: () => clients.listWorkflowTemplates(companyId!),
    enabled: !!companyId && active,
  });

  const selectedTemplate = workflowTemplates?.find((t) => t.id === selectedTemplateId) ?? null;

  const workflowTemplateOptions = useMemo<InlineEntityOption[]>(() => {
    if (!workflowTemplates?.length) return [];
    return workflowTemplates.map((t) => ({
      id: t.id,
      label: t.name,
      searchText: [t.name, ...(t.steps?.map((s) => s.key) ?? [])].join(" "),
    }));
  }, [workflowTemplates]);

  const { data: projects } = useQuery({
    queryKey: scopedQueryKey(cacheScope, queryKeys.projects.list(companyId!)),
    queryFn: () => clients.listProjects(companyId!),
    enabled: !!companyId && active,
  });
  const { orderedProjects } = useProjectOrder({
    projects: projects ?? [],
    companyId,
    userId: projectOrderUserId,
  });

  const assigneeAdapterType = (agents ?? []).find((agent) => agent.id === assigneeId)?.adapterType ?? null;
  const supportsAssigneeOverrides = Boolean(
    assigneeAdapterType && ISSUE_OVERRIDE_ADAPTER_TYPES.has(assigneeAdapterType),
  );
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const options: MentionOption[] = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({
        id: `agent:${agent.id}`,
        name: agent.name,
        kind: "agent",
      });
    }
    for (const project of orderedProjects) {
      options.push({
        id: `project:${project.id}`,
        name: project.name,
        kind: "project",
        projectId: project.id,
        projectColor: project.color,
      });
    }
    return options;
  }, [agents, orderedProjects]);

  const { data: assigneeAdapterModels } = useQuery({
    queryKey: scopedQueryKey(
      cacheScope,
      companyId && assigneeAdapterType
        ? queryKeys.agents.adapterModels(companyId, assigneeAdapterType)
        : ["agents", "none", "adapter-models", assigneeAdapterType ?? "none"],
    ),
    queryFn: () => clients.adapterModels(companyId!, assigneeAdapterType!),
    enabled: Boolean(companyId) && active && supportsAssigneeOverrides,
  });

  const createIssue = useMutation({
    mutationFn: async ({
      companyId,
      recurring,
      workflow,
      ...data
    }: {
      companyId: string;
      recurring?: {
        enabled: boolean;
        name: string;
        expression: string;
        timezone: string;
        issueMode: "create_new" | "reuse_existing" | "reopen_existing";
      };
      workflow?: {
        templateId: string;
      };
    } & Record<string, unknown>) => {
      const issue = await clients.createIssue(companyId, data);
      if (recurring?.enabled) {
        await clients.createIssueSchedule(
          issue.id,
          {
            name: recurring.name,
            expression: recurring.expression,
            timezone: recurring.timezone,
            issueMode: recurring.issueMode,
          },
          companyId,
        );
      }
      if (workflow) {
        await clients.runWorkflow(workflow.templateId, {
          rootIssueId: issue.id,
        });
      }
      return issue;
    },
    onSuccess: (issue) => {
      if (cacheScope === "board" && companyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.taskCrons.company(companyId) });
      }
      if (cacheScope === "mini-app") {
        queryClient.invalidateQueries({ queryKey: ["mini-app"] });
      }
      if (variant === "mini-app") {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      }
      if (draftTimer.current) clearTimeout(draftTimer.current);
      clearDraft();
      reset();
      onSuccess(issue);
    },
  });

  const uploadDescriptionImage = useMutation({
    mutationFn: async (file: File) => {
      if (!companyId) throw new Error("No company selected");
      return clients.uploadImage(companyId, file, "issues/drafts");
    },
  });

  useEffect(() => {
    const busy = createIssue.isPending || uploadDescriptionImage.isPending;
    onMutationBusyChange?.(busy);
  }, [createIssue.isPending, uploadDescriptionImage.isPending, onMutationBusyChange]);

  // Debounced draft saving
  const scheduleSave = useCallback(
    (draft: IssueDraft) => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        if (draft.title.trim()) saveDraft(draft);
      }, DEBOUNCE_MS);
    },
    [],
  );

  // Save draft on meaningful changes
  useEffect(() => {
    if (!active) return;
    scheduleSave({
      title,
      description,
      type,
      status,
      priority,
      assigneeId,
      projectId,
      assigneeModelOverride,
      assigneeThinkingEffort,
      assigneeChrome,
      useIsolatedExecutionWorkspace,
      reviewBundleMode,
      recurringEnabled,
      recurringName,
      recurringExpression,
      recurringTimezone,
      recurringIssueMode,
    });
  }, [
    title,
    description,
    type,
    status,
    priority,
    assigneeId,
    projectId,
    assigneeModelOverride,
    assigneeThinkingEffort,
    assigneeChrome,
    useIsolatedExecutionWorkspace,
    reviewBundleMode,
    recurringEnabled,
    recurringName,
    recurringExpression,
    recurringTimezone,
    recurringIssueMode,
    active,
    scheduleSave,
  ]);

  useEffect(() => {
    if (!active || !companyId) return;
    const prev = prevCompanyIdRef.current;
    if (prev !== null && prev !== companyId) {
      setAssigneeId("");
      setProjectId("");
      setSelectedTemplateId(null);
      setAssigneeModelOverride("");
      setAssigneeThinkingEffort("");
      setAssigneeChrome(false);
      setUseIsolatedExecutionWorkspace(false);
      setReviewerId("");
      setApproverId("");
      setReviewBundleMode("inherit");
    }
    prevCompanyIdRef.current = companyId;
  }, [companyId, active]);

  // Restore draft or apply defaults when dialog opens
  useEffect(() => {
    if (!active) return;
    executionWorkspaceDefaultProjectId.current = null;

    const draft = loadDraft();
    if (defaults.title) {
      setTitle(defaults.title);
      setDescription(defaults.description ?? "");
      setType(defaults.type === "plan" ? "plan" : defaults.type === "explore" ? "explore" : "task");
      setStatus(defaults.status ?? "todo");
      setPriority(defaults.priority ?? "");
      setProjectId(defaults.projectId ?? "");
      setAssigneeId(defaults.assigneeAgentId ?? "");
      setAssigneeModelOverride("");
      setAssigneeThinkingEffort("");
      setAssigneeChrome(false);
      setUseIsolatedExecutionWorkspace(false);
      setReviewBundleMode("inherit");
      setRecurringEnabled(false);
      setRecurringSectionOpen(false);
      setRecurringName("");
      setRecurringExpression("0 9 * * 1-5");
      setRecurringTimezone("UTC");
      setRecurringIssueMode("reopen_existing");
    } else if (draft && draft.title.trim()) {
      setTitle(draft.title);
      setDescription(draft.description);
      setType(draft.type === "plan" ? "plan" : draft.type === "explore" ? "explore" : "task");
      setStatus(draft.status || "todo");
      setPriority(draft.priority);
      setAssigneeId(defaults.assigneeAgentId ?? draft.assigneeId);
      setProjectId(defaults.projectId ?? draft.projectId);
      setAssigneeModelOverride(draft.assigneeModelOverride ?? "");
      setAssigneeThinkingEffort(draft.assigneeThinkingEffort ?? "");
      setAssigneeChrome(draft.assigneeChrome ?? false);
      setUseIsolatedExecutionWorkspace(draft.useIsolatedExecutionWorkspace ?? false);
      setReviewBundleMode(draft.reviewBundleMode ?? "inherit");
      setRecurringEnabled(draft.recurringEnabled ?? false);
      setRecurringSectionOpen(false);
      setRecurringName(draft.recurringName ?? "");
      setRecurringExpression(draft.recurringExpression ?? "0 9 * * 1-5");
      setRecurringTimezone(draft.recurringTimezone ?? "UTC");
      setRecurringIssueMode(draft.recurringIssueMode ?? "reopen_existing");
    } else {
      setTitle(defaults.title ?? "");
      setDescription(defaults.description ?? "");
      setType(defaults.type === "plan" ? "plan" : defaults.type === "explore" ? "explore" : "task");
      setStatus(defaults.status ?? "todo");
      setPriority(defaults.priority ?? "");
      setProjectId(defaults.projectId ?? "");
      setAssigneeId(defaults.assigneeAgentId ?? "");
      setAssigneeModelOverride("");
      setAssigneeThinkingEffort("");
      setAssigneeChrome(false);
      setUseIsolatedExecutionWorkspace(false);
      setReviewBundleMode("inherit");
      setRecurringEnabled(false);
      setRecurringSectionOpen(false);
      setRecurringName("");
      setRecurringExpression("0 9 * * 1-5");
      setRecurringTimezone("UTC");
      setRecurringIssueMode("reopen_existing");
    }
    setClientError(null);
  }, [active, defaults]);

  useEffect(() => {
    if (!supportsAssigneeOverrides) {
      setAssigneeOptionsOpen(false);
      setAssigneeModelOverride("");
      setAssigneeThinkingEffort("");
      setAssigneeChrome(false);
      return;
    }

    const validThinkingValues =
      assigneeAdapterType === "codex_local"
        ? ISSUE_THINKING_EFFORT_OPTIONS.codex_local
        : assigneeAdapterType === "opencode_local"
          ? ISSUE_THINKING_EFFORT_OPTIONS.opencode_local
          : ISSUE_THINKING_EFFORT_OPTIONS.claude_local;
    if (!validThinkingValues.some((option) => option.value === assigneeThinkingEffort)) {
      setAssigneeThinkingEffort("");
    }
  }, [supportsAssigneeOverrides, assigneeAdapterType, assigneeThinkingEffort]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  function reset() {
    setTitle("");
    setDescription("");
    setType("task");
    setStatus("todo");
    setPriority("");
    setAssigneeId("");
    setProjectId("");
    setAssigneeOptionsOpen(false);
    setAssigneeModelOverride("");
    setAssigneeThinkingEffort("");
    setAssigneeChrome(false);
    setUseIsolatedExecutionWorkspace(false);
    setReviewerId("");
    setApproverId("");
    setReviewBundleMode("inherit");
    setRecurringEnabled(false);
    setRecurringSectionOpen(false);
    setRecurringName("");
    setRecurringExpression("0 9 * * 1-5");
    setRecurringTimezone("UTC");
    setRecurringIssueMode("reopen_existing");
    setSelectedTemplateId(null);
    setAdvancedOpen(false);
    setClientError(null);
    executionWorkspaceDefaultProjectId.current = null;
  }

  function discardDraft() {
    clearDraft();
    reset();
    onDiscard?.();
  }

  function handleSubmit() {
    if (!companyId || !title.trim() || createIssue.isPending) return;
    if (recurringEnabled && !assigneeId) {
      setClientError("Recurring schedules require an assignee.");
      return;
    }
    setClientError(null);
    const assigneeAdapterOverrides = buildAssigneeAdapterOverrides({
      adapterType: assigneeAdapterType,
      modelOverride: assigneeModelOverride,
      thinkingEffortOverride: assigneeThinkingEffort,
      chrome: assigneeChrome,
    });
    const selectedProject = orderedProjects.find((project) => project.id === projectId);
    const executionWorkspacePolicy = SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI
      ? selectedProject?.executionWorkspacePolicy
      : null;
    const executionWorkspaceSettings = executionWorkspacePolicy?.enabled
      ? {
          mode: useIsolatedExecutionWorkspace ? "isolated" : "project_primary",
        }
      : null;
    const descriptionForApi =
      (descriptionEditorRef.current?.consumeDeferredSlashExpansion(description) ?? description).trim() || undefined;
    createIssue.mutate({
      companyId,
      title: title.trim(),
      description: descriptionForApi,
      type,
      status,
      priority: priority || "medium",
      ...(assigneeId ? { assigneeAgentId: assigneeId } : {}),
      ...(reviewerId ? { reviewerAgentId: reviewerId } : {}),
      ...(approverId ? { approverAgentId: approverId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(assigneeAdapterOverrides ? { assigneeAdapterOverrides } : {}),
      ...(executionWorkspaceSettings ? { executionWorkspaceSettings } : {}),
      reviewBundleMode,
      recurring: recurringEnabled
        ? {
          enabled: true,
          name: recurringName.trim() || `${title.trim()} recurring`,
          expression: recurringExpression.trim() || "0 9 * * 1-5",
          timezone: recurringTimezone.trim() || "UTC",
          issueMode: recurringIssueMode,
        }
        : undefined,
      workflow: selectedTemplateId
        ? { templateId: selectedTemplateId }
        : undefined,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleAttachImage(evt: ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file) return;
    try {
      const asset = await uploadDescriptionImage.mutateAsync(file);
      const name = file.name || "image";
      setDescription((prev) => {
        const suffix = `![${name}](${asset.contentPath})`;
        return prev ? `${prev}\n\n${suffix}` : suffix;
      });
    } finally {
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  const hasDraft = title.trim().length > 0 || description.trim().length > 0;
  const currentStatus = statuses.find((s) => s.value === status) ?? statuses[1]!;
  const currentPriority = priorities.find((p) => p.value === priority);
  const currentAssignee = (agents ?? []).find((a) => a.id === assigneeId);
  const currentProject = orderedProjects.find((project) => project.id === projectId);
  const currentProjectReviewBundlePolicy = currentProject?.reviewBundlePolicy ?? null;
  const currentProjectSupportsReviewBundles = Boolean(currentProjectReviewBundlePolicy?.enabled);
  const currentProjectAllowsReviewBundleOverride = currentProjectReviewBundlePolicy?.allowIssueOverride ?? true;
  const currentProjectExecutionWorkspacePolicy = SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI
    ? currentProject?.executionWorkspacePolicy ?? null
    : null;
  const currentProjectSupportsExecutionWorkspace = Boolean(currentProjectExecutionWorkspacePolicy?.enabled);
  const assigneeOptionsTitle =
    assigneeAdapterType === "claude_local"
      ? "Claude options"
      : assigneeAdapterType === "codex_local"
        ? "Codex options"
        : assigneeAdapterType === "opencode_local"
          ? "OpenCode options"
        : "Agent options";
  const thinkingEffortOptions =
    assigneeAdapterType === "codex_local"
      ? ISSUE_THINKING_EFFORT_OPTIONS.codex_local
      : assigneeAdapterType === "opencode_local"
        ? ISSUE_THINKING_EFFORT_OPTIONS.opencode_local
      : ISSUE_THINKING_EFFORT_OPTIONS.claude_local;
  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [active]);
  const assigneeOptions = useMemo<InlineEntityOption[]>(
    () =>
      sortAgentsByRecency(
        (agents ?? []).filter((agent) => agent.status !== "terminated"),
        recentAssigneeIds,
      ).map((agent) => ({
        id: agent.id,
        label: agent.name,
        searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
      })),
    [agents, recentAssigneeIds],
  );
  const projectOptions = useMemo<InlineEntityOption[]>(
    () =>
      orderedProjects.map((project) => ({
        id: project.id,
        label: project.name,
        searchText: project.description ?? "",
      })),
    [orderedProjects],
  );
  const savedDraft = loadDraft();
  const hasSavedDraft = Boolean(savedDraft?.title.trim() || savedDraft?.description.trim());
  const canDiscardDraft = hasDraft || hasSavedDraft;
  const createIssueErrorMessage =
    createIssue.error instanceof Error ? createIssue.error.message : "Failed to create issue. Try again.";

  const handleProjectChange = useCallback((nextProjectId: string) => {
    setProjectId(nextProjectId);
    const nextProject = orderedProjects.find((project) => project.id === nextProjectId);
    const policy = SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI ? nextProject?.executionWorkspacePolicy : null;
    executionWorkspaceDefaultProjectId.current = nextProjectId || null;
    setUseIsolatedExecutionWorkspace(Boolean(policy?.enabled && policy.defaultMode === "isolated"));
    setReviewBundleMode("inherit");
  }, [orderedProjects]);

  useEffect(() => {
    if (!active || !projectId || executionWorkspaceDefaultProjectId.current === projectId) {
      return;
    }
    const project = orderedProjects.find((entry) => entry.id === projectId);
    if (!project) return;
    executionWorkspaceDefaultProjectId.current = projectId;
    setUseIsolatedExecutionWorkspace(
      Boolean(
        SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI &&
        project.executionWorkspacePolicy?.enabled &&
        project.executionWorkspacePolicy.defaultMode === "isolated",
      ),
    );
  }, [active, orderedProjects, projectId]);
  const modelOverrideOptions = useMemo<InlineEntityOption[]>(
    () => {
      return [...(assigneeAdapterModels ?? [])]
        .sort((a, b) => {
          const providerA = extractProviderIdWithFallback(a.id);
          const providerB = extractProviderIdWithFallback(b.id);
          const byProvider = providerA.localeCompare(providerB);
          if (byProvider !== 0) return byProvider;
          return a.id.localeCompare(b.id);
        })
        .map((model) => ({
          id: model.id,
          label: model.label,
          searchText: `${model.id} ${extractProviderIdWithFallback(model.id)}`,
        }));
    },
    [assigneeAdapterModels],
  );
  const recurringPresetValue = useMemo(() => {
    const normalized = recurringExpression.trim();
    if (!normalized) return "__custom__";
    const match = cronPresetOptions.find((option) => option.expression === normalized);
    return match?.id ?? "__custom__";
  }, [recurringExpression]);

  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (variant !== "mini-app") return;
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    const mb = tg.MainButton;
    mb.setText("Create Issue");
    mb.show();
    const onClick = () => {
      handleSubmitRef.current?.();
    };
    mb.onClick(onClick);
    return () => {
      mb.offClick(onClick);
      mb.hide();
    };
  }, [variant]);

  useEffect(() => {
    if (variant !== "mini-app") return;
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    const mb = tg.MainButton;
    const hasTitle = title.trim().length > 0;
    if (hasTitle && !createIssue.isPending) {
      mb.enable();
    } else {
      mb.disable();
    }
    mb.setText(selectedTemplateId ? "Create & Run Workflow" : "Create Issue");
  }, [variant, title, createIssue.isPending, selectedTemplateId]);

  const showInlineCreateButton = !(variant === "mini-app" && typeof window !== "undefined" && window.Telegram?.WebApp);

  return (
    <div
      className={cn(
        "flex flex-col flex-1 min-h-0 outline-none",
        variant === "mini-app" && "pb-2",
      )}
      onKeyDown={handleKeyDown}
    >
        {/* Title */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <textarea
            className="w-full text-lg font-semibold bg-transparent outline-none resize-none overflow-hidden placeholder:text-muted-foreground/50"
            placeholder="Issue title"
            rows={1}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            readOnly={createIssue.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                assigneeSelectorRef.current?.focus();
              }
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                assigneeSelectorRef.current?.focus();
              }
            }}
            autoFocus
          />
        </div>

        {/* Stage 1: Assignee + core properties */}
        <div className="px-4 pb-2 shrink-0 space-y-2">
          <div className="overflow-x-auto overscroll-x-contain">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground flex-wrap sm:flex-nowrap sm:min-w-max">
              <span>For</span>
              <InlineEntitySelector
                ref={assigneeSelectorRef}
                value={assigneeId}
                options={assigneeOptions}
                placeholder="Assignee"
                disablePortal
                noneLabel="No assignee"
                searchPlaceholder="Search assignees..."
                emptyMessage="No assignees found."
                onChange={(id) => { if (id) trackRecentAssignee(id); setAssigneeId(id); }}
                onConfirm={() => {
                  descriptionEditorRef.current?.focus();
                }}
                renderTriggerValue={(option) =>
                  option && currentAssignee ? (
                    <>
                      <AgentIcon icon={currentAssignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{option.label}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Assignee</span>
                  )
                }
                renderOption={(option) => {
                  if (!option.id) return <span className="truncate">{option.label}</span>;
                  const assignee = (agents ?? []).find((agent) => agent.id === option.id);
                  return (
                    <>
                      <AgentIcon icon={assignee?.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{option.label}</span>
                    </>
                  );
                }}
              />
            </div>
          </div>

          {/* Project, Status, Priority, Labels */}
          <div className="flex items-center gap-2 flex-wrap">
            <InlineEntitySelector
              ref={projectSelectorRef}
              value={projectId}
              options={projectOptions}
              placeholder="No project"
              disablePortal
              noneLabel="No project"
              searchPlaceholder="Search projects..."
              emptyMessage="No projects found."
              onChange={handleProjectChange}
              renderTriggerValue={(option) =>
                option && currentProject ? (
                  <>
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: currentProject.color ?? "#6366f1" }}
                    />
                    <span className="truncate">{option.label}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Project</span>
                )
              }
              renderOption={(option) => {
                if (!option.id) return <span className="truncate">{option.label}</span>;
                const project = orderedProjects.find((item) => item.id === option.id);
                return (
                  <>
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: project?.color ?? "#6366f1" }}
                    />
                    <span className="truncate">{option.label}</span>
                  </>
                );
              }}
            />

            <Popover open={typeOpen} onOpenChange={setTypeOpen}>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors">
                  {type === "plan" ? (
                    <Map className="h-3 w-3 text-violet-500" />
                  ) : type === "explore" ? (
                    <Search className="h-3 w-3 text-blue-500" />
                  ) : (
                    <ListChecks className="h-3 w-3 text-muted-foreground" />
                  )}
                  {issueTypes.find((t) => t.value === type)?.label ?? "Build"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1" align="start">
                {issueTypes.map((t) => (
                  <button
                    key={t.value}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                      t.value === type && "bg-accent"
                    )}
                    onClick={() => { setType(t.value); setTypeOpen(false); }}
                  >
                    <t.icon className={cn("h-3 w-3", t.value === "plan" ? "text-blue-500" : "text-muted-foreground")} />
                    {t.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <Popover open={statusOpen} onOpenChange={setStatusOpen}>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors">
                  <CircleDot className={cn("h-3 w-3", currentStatus.color)} />
                  {currentStatus.label}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1" align="start">
                {statuses.map((s) => (
                  <button
                    key={s.value}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                      s.value === status && "bg-accent"
                    )}
                    onClick={() => { setStatus(s.value); setStatusOpen(false); }}
                  >
                    <CircleDot className={cn("h-3 w-3", s.color)} />
                    {s.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors">
                  {currentPriority ? (
                    <>
                      <currentPriority.icon className={cn("h-3 w-3", currentPriority.color)} />
                      {currentPriority.label}
                    </>
                  ) : (
                    <>
                      <Minus className="h-3 w-3 text-muted-foreground" />
                      Priority
                    </>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1" align="start">
                {priorities.map((p) => (
                  <button
                    key={p.value}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                      p.value === priority && "bg-accent"
                    )}
                    onClick={() => { setPriority(p.value); setPriorityOpen(false); }}
                  >
                    <p.icon className={cn("h-3 w-3", p.color)} />
                    {p.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors text-muted-foreground">
              <Tag className="h-3 w-3" />
              Labels
            </button>

            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center justify-center rounded-md border border-border p-1 text-xs hover:bg-accent/50 transition-colors text-muted-foreground">
                  <MoreHorizontal className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="start">
                <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Start date
                </button>
                <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Due date
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Stage 1: Description */}
        <div
          className={cn(
            "px-4 pb-2 overflow-y-auto min-h-0 pt-3",
            variant === "mini-app"
              ? "mx-3 mb-1 mt-2 rounded-lg border border-border bg-muted/25 px-3 py-2"
              : "border-t border-border/60",
            expanded ? "flex-1" : "",
          )}
        >
          <MarkdownEditor
            ref={descriptionEditorRef}
            value={description}
            onChange={setDescription}
            placeholder="Add description..."
            bordered={false}
            mentions={mentionOptions}
            contentClassName={cn("text-sm text-muted-foreground pb-12", expanded ? "min-h-[220px]" : "min-h-[120px]")}
            imageUploadHandler={async (file) => {
              const asset = await uploadDescriptionImage.mutateAsync(file);
              return asset.contentPath;
            }}
          />
        </div>

        {/* Attach image (hidden input, accessible from Stage 1) */}
        <input
          ref={attachInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleAttachImage}
        />

        {/* Stage 1: Quick actions bar */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border flex-wrap shrink-0">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors text-muted-foreground"
            onClick={() => attachInputRef.current?.click()}
            disabled={uploadDescriptionImage.isPending}
          >
            <Paperclip className="h-3 w-3" />
            {uploadDescriptionImage.isPending ? "Uploading..." : "Image"}
          </button>

          <div className="flex-1" />

          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
              advancedOpen
                ? "border-primary/30 bg-primary/5 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => setAdvancedOpen((open) => !open)}
            type="button"
          >
            <Settings2 className="h-3 w-3" />
            Advanced
            {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </div>

        {/* Stage 2: Advanced options */}
        {advancedOpen && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3 shrink-0 bg-muted/5">
            {/* Review bundle */}
            {currentProjectSupportsReviewBundles && (
              <div className="space-y-1">
                <div className="text-xs font-medium">Review bundle</div>
                {currentProjectAllowsReviewBundleOverride ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      className={cn(
                        "px-2 py-1 rounded-md text-xs border border-border hover:bg-accent/50 transition-colors",
                        reviewBundleMode === "inherit" && "bg-accent",
                      )}
                      onClick={() => setReviewBundleMode("inherit")}
                    >
                      Use project default
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "px-2 py-1 rounded-md text-xs border border-border hover:bg-accent/50 transition-colors",
                        reviewBundleMode === "optional" && "bg-accent",
                      )}
                      onClick={() => setReviewBundleMode("optional")}
                    >
                      Optional
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "px-2 py-1 rounded-md text-xs border border-border hover:bg-accent/50 transition-colors",
                        reviewBundleMode === "required" && "bg-accent",
                      )}
                      onClick={() => setReviewBundleMode("required")}
                    >
                      Required
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    This project enforces its default:
                    {" "}
                    {currentProjectReviewBundlePolicy?.defaultMode === "required" ? "Required" : "Optional"}.
                  </div>
                )}
              </div>
            )}

            {/* Reviewer & Approver */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-medium">Reviewer</div>
                <InlineEntitySelector
                  className="w-full min-w-0 justify-between"
                  value={reviewerId}
                  options={assigneeOptions}
                  placeholder="No reviewer"
                  disablePortal
                  noneLabel="No reviewer"
                  searchPlaceholder="Search agents..."
                  emptyMessage="No agents found."
                  onChange={setReviewerId}
                  renderTriggerValue={(option) => {
                    if (!option) return <span className="text-muted-foreground">No reviewer</span>;
                    const agent = (agents ?? []).find((a) => a.id === option.id);
                    return (
                      <>
                        <AgentIcon icon={agent?.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{option.label}</span>
                      </>
                    );
                  }}
                  renderOption={(option) => {
                    if (!option.id) return <span className="truncate">{option.label}</span>;
                    const agent = (agents ?? []).find((a) => a.id === option.id);
                    return (
                      <>
                        <AgentIcon icon={agent?.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{option.label}</span>
                      </>
                    );
                  }}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-medium">Approver</div>
                <InlineEntitySelector
                  className="w-full min-w-0 justify-between"
                  value={approverId}
                  options={assigneeOptions}
                  placeholder="No approver"
                  disablePortal
                  noneLabel="No approver"
                  searchPlaceholder="Search agents..."
                  emptyMessage="No agents found."
                  onChange={setApproverId}
                  renderTriggerValue={(option) => {
                    if (!option) return <span className="text-muted-foreground">No approver</span>;
                    const agent = (agents ?? []).find((a) => a.id === option.id);
                    return (
                      <>
                        <AgentIcon icon={agent?.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{option.label}</span>
                      </>
                    );
                  }}
                  renderOption={(option) => {
                    if (!option.id) return <span className="truncate">{option.label}</span>;
                    const agent = (agents ?? []).find((a) => a.id === option.id);
                    return (
                      <>
                        <AgentIcon icon={agent?.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{option.label}</span>
                      </>
                    );
                  }}
                />
              </div>
            </div>

            {/* Execution workspace */}
            {currentProjectSupportsExecutionWorkspace && (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium">Use isolated issue checkout</div>
                  <div className="text-[11px] text-muted-foreground">
                    Create an issue-specific execution workspace instead of using the project's primary checkout.
                  </div>
                </div>
                <button
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    useIsolatedExecutionWorkspace ? "bg-green-600" : "bg-muted",
                  )}
                  onClick={() => setUseIsolatedExecutionWorkspace((value) => !value)}
                  type="button"
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                      useIsolatedExecutionWorkspace ? "translate-x-4.5" : "translate-x-0.5",
                    )}
                  />
                </button>
              </div>
            )}

            {/* Assignee adapter overrides */}
            {supportsAssigneeOverrides && (
              <div>
                <button
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setAssigneeOptionsOpen((open) => !open)}
                >
                  {assigneeOptionsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {assigneeOptionsTitle}
                </button>
                {assigneeOptionsOpen && (
                  <div className="mt-2 rounded-md border border-border p-3 bg-muted/20 space-y-3">
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">Model</div>
                      <InlineEntitySelector
                        value={assigneeModelOverride}
                        options={modelOverrideOptions}
                        placeholder="Default model"
                        disablePortal
                        noneLabel="Default model"
                        searchPlaceholder="Search models..."
                        emptyMessage="No models found."
                        onChange={setAssigneeModelOverride}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">Thinking effort</div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {thinkingEffortOptions.map((option) => (
                          <button
                            key={option.value || "default"}
                            className={cn(
                              "px-2 py-1 rounded-md text-xs border border-border hover:bg-accent/50 transition-colors",
                              assigneeThinkingEffort === option.value && "bg-accent"
                            )}
                            onClick={() => setAssigneeThinkingEffort(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {assigneeAdapterType === "claude_local" && (
                      <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
                        <div className="text-xs text-muted-foreground">Enable Chrome (--chrome)</div>
                        <button
                          className={cn(
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                            assigneeChrome ? "bg-green-600" : "bg-muted"
                          )}
                          onClick={() => setAssigneeChrome((value) => !value)}
                        >
                          <span
                            className={cn(
                              "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                              assigneeChrome ? "translate-x-4.5" : "translate-x-0.5"
                            )}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Workflow template */}
            {workflowTemplates && workflowTemplates.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium">Workflow template</div>
                {selectedTemplate ? (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Workflow className="h-3 w-3 text-primary" />
                        {selectedTemplate.name}
                      </div>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => { setSelectedTemplateId(null); }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {selectedTemplate.steps.map((step, i) => (
                        <div key={step.key} className="flex items-center gap-1">
                          <span className={cn(
                            "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border",
                            step.type === "explore" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                            step.type === "plan" && "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
                            step.type === "task" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                          )}>
                            {step.type}
                          </span>
                          {i < selectedTemplate.steps.length - 1 && (
                            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <InlineEntitySelector
                    className="w-full min-w-0 justify-between text-xs"
                    value={selectedTemplateId ?? ""}
                    options={workflowTemplateOptions}
                    placeholder="None (no workflow)"
                    disablePortal
                    noneLabel="None (no workflow)"
                    searchPlaceholder="Search templates..."
                    emptyMessage="No templates found."
                    onChange={(id) => setSelectedTemplateId(id ? id : null)}
                    renderTriggerValue={(option) => {
                      if (!option) {
                        return <span className="text-muted-foreground">None (no workflow)</span>;
                      }
                      return (
                        <>
                          <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{option.label}</span>
                        </>
                      );
                    }}
                    renderOption={(option) => {
                      if (!option.id) {
                        return <span className="truncate">{option.label}</span>;
                      }
                      return (
                        <>
                          <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{option.label}</span>
                        </>
                      );
                    }}
                  />
                )}
              </div>
            )}

            {/* Recurring schedule */}
            <div>
              <button
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setRecurringSectionOpen((open) => !open)}
                type="button"
              >
                {recurringSectionOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Clock3 className="h-3 w-3" />
                Recurring task
              </button>
              {recurringSectionOpen && (
                <div className="mt-2 rounded-md border border-border p-3 bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
                    <div className="text-xs text-muted-foreground">Enable recurring schedule</div>
                    <button
                      className={cn(
                        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                        recurringEnabled ? "bg-green-600" : "bg-muted",
                      )}
                      onClick={() => setRecurringEnabled((value) => !value)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                          recurringEnabled ? "translate-x-4.5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Name</div>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs"
                      value={recurringName}
                      onChange={(e) => setRecurringName(e.target.value)}
                      placeholder="Weekly status report"
                      disabled={!recurringEnabled}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">Preset</div>
                      <Select
                        value={recurringPresetValue}
                        onValueChange={(nextId) => {
                          if (nextId === "__custom__") return;
                          const preset = cronPresetOptions.find((option) => option.id === nextId);
                          if (!preset) return;
                          setRecurringExpression(preset.expression);
                        }}
                        disabled={!recurringEnabled}
                      >
                        <SelectTrigger size="sm" className="w-full text-xs">
                          <SelectValue placeholder="Custom expression" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__custom__">Custom expression</SelectItem>
                          {cronPresetOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label} ({option.expression})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">Cron expression</div>
                      <input
                        className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs font-mono"
                        value={recurringExpression}
                        onChange={(e) => setRecurringExpression(e.target.value)}
                        placeholder="0 9 * * 1-5"
                        disabled={!recurringEnabled}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">Timezone</div>
                      <input
                        className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs"
                        value={recurringTimezone}
                        onChange={(e) => setRecurringTimezone(e.target.value)}
                        placeholder="UTC"
                        disabled={!recurringEnabled}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Issue behavior</div>
                    <Select
                      value={recurringIssueMode}
                      onValueChange={(v) =>
                        setRecurringIssueMode(v as "create_new" | "reuse_existing" | "reopen_existing")
                      }
                      disabled={!recurringEnabled}
                    >
                      <SelectTrigger size="sm" className="w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reopen_existing">Reopen this issue when done</SelectItem>
                        <SelectItem value="reuse_existing">Reuse this issue</SelectItem>
                        <SelectItem value="create_new">Create a new issue each run</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {recurringEnabled && !assigneeId && (
                    <div className="text-[11px] text-amber-500">
                      Select an assignee to enable recurring scheduling.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={discardDraft}
            disabled={createIssue.isPending || !canDiscardDraft}
          >
            Discard Draft
          </Button>
          <div className="flex items-center gap-3">
            <div className="min-h-5 text-right">
              {createIssue.isPending ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Creating issue...
                </span>
              ) : clientError ? (
                <span className="text-xs text-destructive">{clientError}</span>
              ) : createIssue.isError ? (
                <span className="text-xs text-destructive">{createIssueErrorMessage}</span>
              ) : canDiscardDraft ? (
                <span className="text-xs text-muted-foreground">Draft autosaves locally</span>
              ) : null}
            </div>
            {showInlineCreateButton ? (
              <Button
                size="sm"
                className="min-w-[8.5rem] disabled:opacity-100"
                disabled={!title.trim() || createIssue.isPending}
                onClick={handleSubmit}
                aria-busy={createIssue.isPending}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  {createIssue.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>{createIssue.isPending ? "Creating..." : selectedTemplateId ? "Create & Run Workflow" : "Create Issue"}</span>
                </span>
              </Button>
            ) : null}
          </div>
        </div>
    </div>
  );
}
