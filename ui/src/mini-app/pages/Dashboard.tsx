import { useQuery } from "@tanstack/react-query";
import { miniAppApi } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingSpinner } from "../components/LoadingSpinner";

interface DashboardProps {
  companyId: string;
  onIssueClick: (issueId: string) => void;
}

interface AgentSummary {
  id: string;
  name: string;
  title: string | null;
  status: string;
  currentTask: { identifier: string; title: string } | null;
}

interface IssueSummary {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
}

interface DashboardData {
  agents: AgentSummary[];
  recentIssues: IssueSummary[];
  activeRuns: number;
  issuesByStatus: Record<string, number>;
}

export function Dashboard({ companyId, onIssueClick }: DashboardProps) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["mini-app", "dashboard", companyId],
    queryFn: () => miniAppApi.get<DashboardData>(`/companies/${companyId}/dashboard`),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <button
          onClick={() => refetch()}
          className="text-sm text-[var(--tg-theme-button-color)] active:opacity-70"
        >
          Refresh
        </button>
      </header>

      {/* Stats row */}
      {data && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Active Runs" value={data.activeRuns} />
          <StatCard label="In Progress" value={data.issuesByStatus?.in_progress ?? 0} />
          <StatCard label="Blocked" value={data.issuesByStatus?.blocked ?? 0} accent="red" />
        </div>
      )}

      {/* Agent status cards */}
      <section>
        <h2 className="text-sm font-medium text-[var(--tg-theme-hint-color)] mb-2">Agents</h2>
        <div className="space-y-2">
          {data?.agents?.slice(0, 8).map((agent) => (
            <div
              key={agent.id}
              className="bg-[var(--tg-theme-secondary-bg-color)] rounded-lg p-3 flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{agent.name}</span>
                  <StatusBadge status={agent.status} />
                </div>
                {agent.currentTask && (
                  <p className="text-xs text-[var(--tg-theme-hint-color)] mt-0.5 truncate">
                    {agent.currentTask.identifier}: {agent.currentTask.title}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent issues */}
      <section>
        <h2 className="text-sm font-medium text-[var(--tg-theme-hint-color)] mb-2">Recent Issues</h2>
        <div className="space-y-1">
          {data?.recentIssues?.slice(0, 10).map((issue) => (
            <button
              key={issue.id}
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
        </div>
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
