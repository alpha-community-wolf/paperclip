import { useQuery } from "@tanstack/react-query";
import type { DashboardSummary } from "@paperclipai/shared";
import { miniAppApi } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingSpinner } from "../components/LoadingSpinner";

interface DashboardProps {
  companyId: string;
  onIssueClick: (issueId: string) => void;
}

interface AgentRow {
  id: string;
  name: string;
  title: string | null;
  status: string;
}

interface IssueRow {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assigneeAgent?: { name: string } | null;
}

export function Dashboard({ companyId, onIssueClick }: DashboardProps) {
  const summaryQuery = useQuery({
    queryKey: ["mini-app", "dashboard", companyId],
    queryFn: () => miniAppApi.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
  });

  const agentsQuery = useQuery({
    queryKey: ["mini-app", "dashboard-agents", companyId],
    queryFn: () => miniAppApi.get<AgentRow[]>(`/companies/${companyId}/agents`),
  });

  const issuesQuery = useQuery({
    queryKey: ["mini-app", "dashboard-issues", companyId],
    queryFn: () =>
      miniAppApi.get<IssueRow[]>(
        `/companies/${companyId}/issues?status=todo,in_progress,blocked,in_review`,
      ),
  });

  const { data: summary, isLoading, refetch, isError, error } = summaryQuery;

  if (isLoading) return <LoadingSpinner />;

  if (isError || !summary) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard";
    return (
      <div className="p-4 space-y-2">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-sm text-red-400">{message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-[var(--tg-theme-button-color)]"
        >
          Retry
        </button>
      </div>
    );
  }

  const recentIssues = (issuesQuery.data ?? []).slice(0, 10);
  const agentRows = (agentsQuery.data ?? []).slice(0, 8);

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <button
          type="button"
          onClick={() => {
            void refetch();
            void agentsQuery.refetch();
            void issuesQuery.refetch();
          }}
          className="text-sm text-[var(--tg-theme-button-color)] active:opacity-70"
        >
          Refresh
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Running" value={summary.agents.running} />
        <StatCard label="In progress" value={summary.tasks.inProgress} />
        <StatCard label="Blocked" value={summary.tasks.blocked} accent="red" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Open" value={summary.tasks.open} />
        <StatCard label="Approvals" value={summary.pendingApprovals} />
        <StatCard
          label="Budget %"
          value={Math.round(summary.costs.monthUtilizationPercent)}
        />
      </div>

      <section>
        <h2 className="text-sm font-medium text-[var(--tg-theme-hint-color)] mb-2">Agents</h2>
        {agentsQuery.isLoading && <LoadingSpinner />}
        {!agentsQuery.isLoading && (
          <div className="space-y-2">
            {agentRows.map((agent) => (
              <div
                key={agent.id}
                className="bg-[var(--tg-theme-secondary-bg-color)] rounded-lg p-3 flex items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{agent.name}</span>
                    <StatusBadge status={agent.status} />
                  </div>
                  {agent.title && (
                    <p className="text-xs text-[var(--tg-theme-hint-color)] mt-0.5 truncate">{agent.title}</p>
                  )}
                </div>
              </div>
            ))}
            {agentRows.length === 0 && (
              <p className="text-sm text-[var(--tg-theme-hint-color)]">No agents</p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-[var(--tg-theme-hint-color)] mb-2">Recent issues</h2>
        {issuesQuery.isLoading && <LoadingSpinner />}
        {!issuesQuery.isLoading && (
          <div className="space-y-1">
            {recentIssues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => onIssueClick(issue.id)}
                className="w-full bg-[var(--tg-theme-secondary-bg-color)] rounded-lg p-3 text-left active:opacity-70 transition-opacity"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--tg-theme-hint-color)] shrink-0">{issue.identifier}</span>
                  <StatusBadge status={issue.status} />
                </div>
                <p className="text-sm mt-1 truncate">{issue.title}</p>
              </button>
            ))}
            {recentIssues.length === 0 && (
              <p className="text-sm text-[var(--tg-theme-hint-color)]">No open issues</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-[var(--tg-theme-secondary-bg-color)] rounded-lg p-3 text-center">
      <div className={`text-xl font-bold ${accent === "red" && value > 0 ? "text-red-400" : ""}`}>
        {value}
      </div>
      <div className="text-[10px] text-[var(--tg-theme-hint-color)] mt-0.5">{label}</div>
    </div>
  );
}
