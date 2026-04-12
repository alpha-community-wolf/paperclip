import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  systemChoresApi,
  type SystemChoreType,
  type SystemChoreRun,
  type CreateCustomChoreInput,
} from "../api/systemChores";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleField } from "../components/agent-config-primitives";
import {
  Cog,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Zap,
} from "lucide-react";

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const absDiff = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  if (absDiff < 60_000) return isFuture ? "in < 1m" : "< 1m ago";
  if (absDiff < 3600_000) {
    const mins = Math.floor(absDiff / 60_000);
    return isFuture ? `in ${mins}m` : `${mins}m ago`;
  }
  if (absDiff < 86400_000) {
    const hrs = Math.floor(absDiff / 3600_000);
    return isFuture ? `in ${hrs}h` : `${hrs}h ago`;
  }
  const days = Math.floor(absDiff / 86400_000);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily (9 AM)", value: "0 9 * * *" },
  { label: "Weekdays (9 AM)", value: "0 9 * * 1-5" },
  { label: "Weekly (Mon 9 AM)", value: "0 9 * * 1" },
];

function ChoreCard({
  chore,
  runs,
  companyId,
  onEdit,
  onDelete,
}: {
  chore: SystemChoreType;
  runs: SystemChoreRun[];
  companyId: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const queryClient = useQueryClient();
  const cfg = chore.config;
  const enabled = cfg?.enabled ?? chore.defaults.enabled;
  const isCustom = chore.choreType === "custom";

  const toggleMutation = useMutation({
    mutationFn: (newEnabled: boolean) =>
      systemChoresApi.updateConfig(companyId, chore.key, { enabled: newEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemChores.list(companyId) });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: () => systemChoresApi.trigger(companyId, chore.key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemChores.list(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.systemChores.runs(companyId, chore.key) });
    },
  });

  const choreRuns = runs.filter((r) => r.systemChoreKey === chore.key).slice(0, 5);
  const hasFailures = (cfg?.consecutiveFailures ?? 0) > 0;

  // Extract target agent name from config for custom chores
  const targetAgentId = isCustom ? (cfg?.config as Record<string, unknown>)?.agentId as string : null;

  return (
    <div className="rounded-md border border-border">
      {/* Header */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{chore.name}</div>
              {isCustom && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-300">
                  <Zap className="h-2.5 w-2.5" />
                  Custom
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{chore.description}</div>
          </div>
          <div className="shrink-0 pt-0.5">
            <ToggleField
              label=""
              checked={enabled}
              onChange={(v) => toggleMutation.mutate(v)}
            />
          </div>
        </div>

        {/* Schedule + Timing row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono">
            {cfg?.expression ?? chore.defaults.expression}
          </span>
          <span>{cfg?.timezone ?? chore.defaults.timezone}</span>
          <span>Last: {formatRelativeTime(cfg?.lastRunAt ?? null)}</span>
          <span>Next: {cfg?.nextRunAt ? formatRelativeTime(cfg.nextRunAt) : "—"}</span>
          {cfg?.model && <span>Model: {cfg.model}</span>}
          {targetAgentId && (
            <span className="text-purple-600 dark:text-purple-400">
              Target: {targetAgentId.slice(0, 8)}…
            </span>
          )}
        </div>

        {/* Warnings + Actions */}
        <div className="flex items-center gap-2">
          {hasFailures && (
            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {cfg!.consecutiveFailures} consecutive failure{cfg!.consecutiveFailures !== 1 ? "s" : ""}
                {!cfg!.enabled && cfg!.consecutiveFailures >= 5 ? " — auto-disabled" : ""}
              </span>
            </div>
          )}
          {cfg?.lastError && (
            <span className="text-xs text-destructive truncate max-w-xs" title={cfg.lastError}>
              {cfg.lastError}
            </span>
          )}
          <div className="flex-1" />
          {isCustom && onEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={onEdit}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {isCustom && onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            disabled={triggerMutation.isPending}
            onClick={() => triggerMutation.mutate()}
          >
            {triggerMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Run Now
          </Button>
        </div>
      </div>

      {/* Recent Runs */}
      {choreRuns.length > 0 && (
        <div className="border-t border-border px-4 py-2 space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Recent Runs
          </div>
          {choreRuns.map((run) => (
            <div key={run.id} className="flex items-center gap-2 text-xs py-0.5">
              <RunStatusIcon status={run.status} />
              <span className="text-muted-foreground w-16 shrink-0">
                {formatRelativeTime(run.startedAt ?? run.createdAt)}
              </span>
              <span className="text-muted-foreground truncate">
                {run.status === "completed" && run.resultJson
                  ? (run.resultJson as Record<string, unknown>).summary as string ?? "Completed"
                  : run.status === "failed"
                  ? run.error ?? "Failed"
                  : run.status}
              </span>
              {run.finishedAt && run.startedAt && (
                <span className="text-muted-foreground ml-auto shrink-0">
                  {Math.round(
                    (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
                  )}s
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateChoreDialog({
  companyId,
  editingChore,
  onClose,
}: {
  companyId: string;
  editingChore?: SystemChoreType | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!editingChore;

  const editConfig = editingChore?.config?.config as Record<string, unknown> | undefined;
  const editTemplate = editConfig?.issueTemplate as Record<string, unknown> | undefined;

  const [name, setName] = useState(editingChore?.name ?? "");
  const [description, setDescription] = useState(editingChore?.description ?? "");
  const [expression, setExpression] = useState(
    editingChore?.config?.expression ?? editingChore?.defaults.expression ?? "0 9 * * *",
  );
  const [timezone, setTimezone] = useState(
    editingChore?.config?.timezone ?? editingChore?.defaults.timezone ?? "UTC",
  );
  const [agentId, setAgentId] = useState((editConfig?.agentId as string) ?? "");
  const [issueTitle, setIssueTitle] = useState((editTemplate?.title as string) ?? "");
  const [issueDescription, setIssueDescription] = useState(
    (editTemplate?.description as string) ?? "",
  );
  const [issuePriority, setIssuePriority] = useState(
    (editTemplate?.priority as string) ?? "medium",
  );

  const { data: agentsList } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateCustomChoreInput) =>
      systemChoresApi.createCustom(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemChores.list(companyId) });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      systemChoresApi.updateConfig(companyId, editingChore!.key, input as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemChores.list(companyId) });
      onClose();
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !expression || !agentId || !issueTitle) return;

    const issueTemplate = {
      title: issueTitle,
      ...(issueDescription ? { description: issueDescription } : {}),
      priority: issuePriority as "low" | "medium" | "high" | "critical",
    };

    if (isEditing) {
      updateMutation.mutate({
        name,
        description,
        expression,
        timezone,
        agentId,
        issueTemplate,
      });
    } else {
      createMutation.mutate({
        name,
        description: description || undefined,
        expression,
        timezone,
        agentId,
        issueTemplate,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="chore-name">Name</Label>
        <Input
          id="chore-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Daily Report"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="chore-desc">Description (optional)</Label>
        <Textarea
          id="chore-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this chore does..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Schedule</Label>
        <div className="flex flex-wrap gap-1.5">
          {CRON_PRESETS.map((p) => (
            <Button
              key={p.value}
              type="button"
              size="sm"
              variant={expression === p.value ? "default" : "outline"}
              className="h-6 text-[11px]"
              onClick={() => setExpression(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Input
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="0 9 * * 1-5"
          className="font-mono text-xs"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Timezone</Label>
        <Input
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="UTC"
        />
      </div>

      <div className="space-y-2">
        <Label>Target Agent</Label>
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger>
            <SelectValue placeholder="Select an agent..." />
          </SelectTrigger>
          <SelectContent>
            {agentsList?.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Issue Template
        </div>

        <div className="space-y-2">
          <Label htmlFor="issue-title">Title</Label>
          <Input
            id="issue-title"
            value={issueTitle}
            onChange={(e) => setIssueTitle(e.target.value)}
            placeholder="Daily Report — {{date}}"
            required
          />
          <p className="text-[10px] text-muted-foreground">
            Variables: {"{{date}}"}, {"{{datetime}}"}, {"{{chore_name}}"}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="issue-desc">Description (optional)</Label>
          <Textarea
            id="issue-desc"
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            placeholder="Generate the daily status report."
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={issuePriority} onValueChange={setIssuePriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !name || !expression || !agentId || !issueTitle}>
          {isPending && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          {isEditing ? "Save Changes" : "Create Chore"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function SystemChores() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId!;

  const [createOpen, setCreateOpen] = useState(false);
  const [editingChore, setEditingChore] = useState<SystemChoreType | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SystemChoreType | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "System Chores" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const { data: chores, isLoading: choresLoading } = useQuery({
    queryKey: queryKeys.systemChores.list(companyId),
    queryFn: () => systemChoresApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.systemChores.runs(companyId),
    queryFn: () => systemChoresApi.listRuns(companyId, undefined, 50),
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (choreKey: string) => systemChoresApi.deleteCustom(companyId, choreKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemChores.list(companyId) });
      setDeleteConfirm(null);
    },
  });

  if (!selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  const builtInChores = chores?.filter((c) => c.choreType !== "custom") ?? [];
  const customChores = chores?.filter((c) => c.choreType === "custom") ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Cog className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">System Chores</h1>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Scheduled background tasks that run at the company level. Built-in chores run server-side; custom chores create issues assigned to agents.
      </p>

      {choresLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading system chores...
        </div>
      )}

      {/* Built-in Chores */}
      {builtInChores.length > 0 && (
        <div className="space-y-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Built-In Chores
          </div>
          {builtInChores.map((chore) => (
            <ChoreCard
              key={chore.key}
              chore={chore}
              runs={runs ?? []}
              companyId={companyId}
            />
          ))}
        </div>
      )}

      {/* Custom Chores */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Custom Chores
          </div>
          <Dialog open={createOpen || !!editingChore} onOpenChange={(open) => {
            if (!open) {
              setCreateOpen(false);
              setEditingChore(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3 w-3" />
                Create Chore
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingChore ? "Edit Custom Chore" : "Create Custom Chore"}</DialogTitle>
                <DialogDescription>
                  {editingChore
                    ? "Update the configuration for this custom chore."
                    : "Create a scheduled chore that creates issues assigned to an agent."}
                </DialogDescription>
              </DialogHeader>
              <CreateChoreDialog
                companyId={companyId}
                editingChore={editingChore}
                onClose={() => {
                  setCreateOpen(false);
                  setEditingChore(null);
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {customChores.length === 0 && !choresLoading && (
          <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
            No custom chores yet. Create one to schedule recurring agent tasks.
          </div>
        )}

        {customChores.map((chore) => (
          <ChoreCard
            key={chore.key}
            chore={chore}
            runs={runs ?? []}
            companyId={companyId}
            onEdit={() => setEditingChore(chore)}
            onDelete={() => setDeleteConfirm(chore)}
          />
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Custom Chore</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.key)}
            >
              {deleteMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
