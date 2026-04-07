import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { systemChoresApi, type SystemChoreType, type SystemChoreRun } from "../api/systemChores";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { ToggleField } from "../components/agent-config-primitives";
import {
  Cog,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
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

function ChoreCard({
  chore,
  runs,
  companyId,
}: {
  chore: SystemChoreType;
  runs: SystemChoreRun[];
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const cfg = chore.config;
  const enabled = cfg?.enabled ?? chore.defaults.enabled;

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

  return (
    <div className="rounded-md border border-border">
      {/* Header */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{chore.name}</div>
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

export function SystemChores() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const companyId = selectedCompanyId!;

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

  if (!selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Cog className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">System Chores</h1>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Scheduled background tasks that run at the company level, independent of any agent.
      </p>

      {choresLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading system chores...
        </div>
      )}

      {chores && chores.length === 0 && (
        <div className="text-sm text-muted-foreground py-8">
          No system chores registered. They will appear here after the server seeds them on startup.
        </div>
      )}

      {chores && chores.length > 0 && (
        <div className="space-y-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Configured Chores
          </div>
          {chores.map((chore) => (
            <ChoreCard
              key={chore.key}
              chore={chore}
              runs={runs ?? []}
              companyId={companyId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
