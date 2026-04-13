import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { miniAppApi } from "../api/client";
import { StatusBadge, PriorityBadge } from "../components/StatusBadge";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IssueListProps {
  companyId: string;
  onIssueClick: (issueId: string) => void;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assigneeAgent: { name: string } | null;
}

const STATUS_FILTERS = ["all", "todo", "in_progress", "blocked", "in_review"] as const;

export function IssueList({ companyId, onIssueClick }: IssueListProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const statusQuery = statusFilter === "all" ? "todo,in_progress,blocked,in_review" : statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ["mini-app", "issues", companyId, statusFilter],
    queryFn: () =>
      miniAppApi.get<Issue[]>(`/companies/${companyId}/issues?status=${statusQuery}`),
  });

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-semibold">Issues</h1>

      {/* Status filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {STATUS_FILTERS.map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "secondary"}
            size="xs"
            className={cn("shrink-0 rounded-full")}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "All Active" : s.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      {isLoading && <LoadingSpinner />}

      {!isLoading && (
        <div className="space-y-1.5">
          {(data ?? []).map((issue) => (
            <button
              key={issue.id}
              onClick={() => onIssueClick(issue.id)}
              className="w-full bg-card border border-border rounded-md p-3 text-left active:opacity-70 transition-opacity"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs text-muted-foreground">{issue.identifier}</span>
                <div className="flex items-center gap-1.5">
                  <PriorityBadge priority={issue.priority} />
                  <StatusBadge status={issue.status} />
                </div>
              </div>
              <p className="text-sm truncate">{issue.title}</p>
              {issue.assigneeAgent && (
                <p className="text-xs text-muted-foreground mt-1">
                  {issue.assigneeAgent.name}
                </p>
              )}
            </button>
          ))}

          {(data ?? []).length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No issues found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
