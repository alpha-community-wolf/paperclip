import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { heartbeatsApi, type FailedRunForIssue } from "../api/heartbeats";
import { approvalsApi } from "../api/approvals";
import { authApi } from "../api/auth";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { queryKeys } from "../lib/queryKeys";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { EntityRow } from "../components/EntityRow";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../components/ui/collapsible";
import { formatDate } from "../lib/utils";
import type { Issue, Approval } from "@paperclipai/shared";
import {
  Briefcase,
  AlertTriangle,
  ShieldCheck,
  CircleDot,
  Clock,
  Eye,
  Play,
  ChevronRight,
} from "lucide-react";

function CollapsibleSection({
  icon: Icon,
  label,
  count,
  tone = "default",
  defaultOpen = true,
  children,
  emptyMessage,
}: {
  icon: typeof Briefcase;
  label: string;
  count: number;
  tone?: "default" | "danger" | "warning";
  defaultOpen?: boolean;
  children: React.ReactNode;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneClasses = {
    default: "text-muted-foreground",
    danger: "text-destructive",
    warning: "text-amber-500",
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 mb-2 group cursor-pointer select-none"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          />
          <Icon className={`h-4 w-4 ${toneClasses[tone]}`} />
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded-md ${
              tone === "danger"
                ? "bg-destructive/10 text-destructive"
                : tone === "warning"
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {count}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {count === 0 && emptyMessage ? (
          <p className="text-sm text-muted-foreground pl-6">{emptyMessage}</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            {children}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function FailedRunRow({ run }: { run: FailedRunForIssue }) {
  return (
    <EntityRow
      identifier={run.agentName}
      title={run.error ?? "Run failed"}
      subtitle={
        [
          !run.startedAt ? "Never started" : null,
          run.invocationSource !== "on_demand" ? run.invocationSource : null,
          run.issueId ? `Issue: ${run.issueId.slice(0, 8)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
      to={`/runs/${run.id}`}
      leading={
        <div className="flex items-center gap-2">
          <Play className="h-3.5 w-3.5 text-destructive" />
        </div>
      }
      trailing={
        <span className="text-xs text-muted-foreground">
          {run.finishedAt ? formatDate(run.finishedAt) : formatDate(run.createdAt)}
        </span>
      }
    />
  );
}

/** Group process_lost failures that share the same finishedAt into batches. */
type FailedRunOrGroup =
  | { kind: "single"; run: FailedRunForIssue }
  | { kind: "group"; finishedAt: string; runs: FailedRunForIssue[] };

function groupFailedRuns(runs: FailedRunForIssue[]): FailedRunOrGroup[] {
  const processLostByTimestamp = new Map<string, FailedRunForIssue[]>();
  const other: FailedRunForIssue[] = [];

  for (const run of runs) {
    const isProcessLost = run.error?.includes("Process lost") ?? false;
    if (isProcessLost && run.finishedAt) {
      const key = run.finishedAt;
      const group = processLostByTimestamp.get(key);
      if (group) {
        group.push(run);
      } else {
        processLostByTimestamp.set(key, [run]);
      }
    } else {
      other.push(run);
    }
  }

  const result: FailedRunOrGroup[] = [];

  // Add grouped process_lost entries (only group if 2+ runs share a timestamp)
  for (const [finishedAt, group] of processLostByTimestamp) {
    if (group.length === 1) {
      result.push({ kind: "single", run: group[0] });
    } else {
      result.push({ kind: "group", finishedAt, runs: group });
    }
  }

  // Add non-process_lost entries
  for (const run of other) {
    result.push({ kind: "single", run });
  }

  // Sort by most recent first
  result.sort((a, b) => {
    const aTime = a.kind === "group" ? a.finishedAt : (a.run.finishedAt ?? a.run.createdAt);
    const bTime = b.kind === "group" ? b.finishedAt : (b.run.finishedAt ?? b.run.createdAt);
    return bTime.localeCompare(aTime);
  });

  return result;
}

function FailedRunGroupRow({ finishedAt, runs }: { finishedAt: string; runs: FailedRunForIssue[] }) {
  const [expanded, setExpanded] = useState(false);
  const agents = [...new Set(runs.map((r) => r.agentName))];
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive truncate">
            Server restart — {runs.length} runs affected
          </p>
          <p className="text-xs text-muted-foreground truncate">
            Agents: {agents.join(", ")}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{formatDate(finishedAt)}</span>
        <ChevronRight
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-l-2 border-destructive/20 ml-5">
          {runs.map((run) => (
            <FailedRunRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue, state }: { issue: Issue; state?: unknown }) {
  return (
    <EntityRow
      identifier={issue.identifier ?? issue.id.slice(0, 8)}
      title={issue.title}
      to={`/issues/${issue.identifier ?? issue.id}`}
      state={state}
      leading={
        <>
          <PriorityIcon priority={issue.priority} />
          <StatusIcon status={issue.status} />
        </>
      }
      trailing={
        <span className="text-xs text-muted-foreground">
          {formatDate(issue.updatedAt ?? issue.createdAt)}
        </span>
      }
    />
  );
}

function approvalLabel(approval: Approval): string {
  const payload = approval.payload as Record<string, unknown> | undefined;
  if (payload?.skillName && typeof payload.skillName === "string")
    return `Skill: ${payload.skillName}`;
  if (payload?.summary && typeof payload.summary === "string")
    return payload.summary.slice(0, 80);
  return `${approval.type} approval`;
}

function ApprovalRow({ approval }: { approval: Approval }) {
  return (
    <EntityRow
      identifier={approval.id.slice(0, 8)}
      title={approvalLabel(approval)}
      to={`/approvals/${approval.id}`}
      leading={
        <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
      }
      trailing={
        <span className="text-xs text-muted-foreground">
          {formatDate(approval.createdAt)}
        </span>
      }
    />
  );
}

export function MyWork() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const issueLinkState = useMemo(
    () => createIssueDetailLocationState("My Work", "/my-work"),
    [],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "My Work" }]);
  }, [setBreadcrumbs]);

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;

  const activeAssignedStatuses = "backlog,todo,in_progress,blocked";
  const { data: assignedIssues, isLoading: assignedLoading } = useQuery({
    queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, {
        assigneeUserId: "me",
        status: activeAssignedStatuses,
      }),
    enabled: !!selectedCompanyId,
  });

  const { data: inReviewIssues, isLoading: reviewLoading } = useQuery({
    queryKey: [...queryKeys.issues.list(selectedCompanyId!), "my-work", "in-review"],
    queryFn: () => issuesApi.list(selectedCompanyId!, { status: "in_review" }),
    enabled: !!selectedCompanyId,
  });

  // Touched issues (recently interacted with by current user)
  const { data: touchedIssues, isLoading: touchedLoading } = useQuery({
    queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, { touchedByUserId: currentUserId! }),
    enabled: !!selectedCompanyId && !!currentUserId,
  });

  // Pending approvals
  const { data: pendingApprovals, isLoading: approvalsLoading } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!, "pending"),
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId,
  });

  // Failed runs
  const { data: failedRuns, isLoading: runsLoading } = useQuery({
    queryKey: queryKeys.failedRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.failedRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Briefcase} message="Select a company to view your work." />;
  }

  const isLoading = assignedLoading || reviewLoading || touchedLoading || approvalsLoading || runsLoading;
  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  // Recently touched: exclude those already in other sections, limit to 20 most recent
  const shownIds = new Set([
    ...(inReviewIssues ?? []).map((i) => i.id),
    ...(assignedIssues ?? []).map((i) => i.id),
  ]);
  const recentlyTouched = (touchedIssues ?? [])
    .filter((i) => !shownIds.has(i.id) && !["cancelled"].includes(i.status))
    .slice(0, 20);

  const approvals = pendingApprovals ?? [];
  const failed = failedRuns ?? [];
  const groupedFailed = groupFailedRuns(failed);

  const totalItems =
    groupedFailed.length
    + approvals.length
    + (inReviewIssues?.length ?? 0)
    + (assignedIssues?.length ?? 0)
    + recentlyTouched.length;

  return (
    <div className="animate-page-enter max-w-4xl space-y-6">
      {/* Summary strip */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-foreground">My Work</span>
        </div>
        {totalItems === 0 && (
          <span className="text-muted-foreground">All clear</span>
        )}
      </div>

      {/* Pending Approvals */}
      {approvals.length > 0 && (
        <CollapsibleSection
          icon={ShieldCheck}
          label="Pending Approvals"
          count={approvals.length}
          tone="warning"
        >
          {approvals.map((approval) => (
            <ApprovalRow key={approval.id} approval={approval} />
          ))}
        </CollapsibleSection>
      )}

      {/* In Review — all issues needing human review */}
      {(inReviewIssues?.length ?? 0) > 0 && (
        <CollapsibleSection
          icon={Eye}
          label="In Review"
          count={inReviewIssues?.length ?? 0}
        >
          {(inReviewIssues ?? []).map((issue) => (
            <IssueRow key={issue.id} issue={issue} state={issueLinkState} />
          ))}
        </CollapsibleSection>
      )}

      {/* Assigned Issues */}
      <CollapsibleSection
        icon={CircleDot}
        label="Assigned to Me"
        count={assignedIssues?.length ?? 0}
        emptyMessage="No issues assigned to you."
      >
        {(assignedIssues ?? []).map((issue) => (
          <IssueRow key={issue.id} issue={issue} />
        ))}
      </CollapsibleSection>

      {/* Recently Touched */}
      <CollapsibleSection
        icon={Clock}
        label="Recently Touched"
        count={recentlyTouched.length}
        emptyMessage="No recently touched issues."
      >
        {recentlyTouched.map((issue) => (
          <IssueRow key={issue.id} issue={issue} />
        ))}
      </CollapsibleSection>

      {/* Failed Runs — at the bottom, collapsed by default when >5 items */}
      {groupedFailed.length > 0 && (
        <CollapsibleSection
          icon={AlertTriangle}
          label="Failed Runs"
          count={failed.length}
          tone="danger"
          defaultOpen={groupedFailed.length <= 5}
        >
          {groupedFailed.map((entry) =>
            entry.kind === "single" ? (
              <FailedRunRow key={entry.run.id} run={entry.run} />
            ) : (
              <FailedRunGroupRow
                key={entry.finishedAt}
                finishedAt={entry.finishedAt}
                runs={entry.runs}
              />
            ),
          )}
        </CollapsibleSection>
      )}

      {totalItems === 0 && (
        <EmptyState
          icon={Briefcase}
          message="You're all caught up. No issues, approvals, or failed runs need your attention."
        />
      )}
    </div>
  );
}
