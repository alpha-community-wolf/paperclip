import { Link } from "@/lib/router";
import { cn, activityLevel, activityConfig } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";
import { StatusIcon } from "./StatusIcon";
import { DependencyPills } from "./DependencyPills";
import { IssueTypePills } from "./IssueTypePills";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock3, Copy, XCircle, Repeat } from "lucide-react";
import type { Issue } from "@paperclipai/shared";
import type { FailedRunInfo } from "./issues/columns";

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

export interface IssueCardProps {
  issue: Issue;
  isChecked: boolean;
  hasSelection: boolean;
  onToggleSelect: () => void;
  isKbSelected: boolean;
  liveIssueIds?: Set<string>;
  failedRunMap?: Map<string, FailedRunInfo>;
  recurringIssueIds: Set<string>;
  templateIssueIds: Set<string>;
  spawnedFromTemplateIds: Set<string>;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  issueLinkState?: unknown;
}

export function IssueCard({
  issue,
  isChecked,
  hasSelection,
  onToggleSelect,
  isKbSelected,
  liveIssueIds,
  failedRunMap,
  recurringIssueIds,
  templateIssueIds,
  spawnedFromTemplateIds,
  onUpdateIssue,
  issueLinkState,
}: IssueCardProps) {
  return (
    <Link
      to={`/issues/${issue.identifier ?? issue.id}`}
      state={issueLinkState}
      className={cn(
        "group/row flex items-start gap-2 py-2.5 pl-3 pr-3 text-sm last:border-b-0 cursor-pointer hover:bg-accent/50 transition-colors no-underline text-inherit",
        isKbSelected && "ring-2 ring-inset ring-primary bg-accent/60",
        isChecked && "bg-primary/5",
      )}
    >
      {/* Checkbox */}
      <span
        className={cn(
          "shrink-0 flex items-center justify-center w-5 h-5 mt-px",
          hasSelection ? "visible" : "invisible group-hover/row:visible",
        )}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <Checkbox
          checked={isChecked}
          onCheckedChange={onToggleSelect}
          className="h-4 w-4"
        />
      </span>

      {/* Status */}
      <span
        className="shrink-0 pt-px"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <StatusIcon
          status={issue.status}
          onChange={(s) => onUpdateIssue(issue.id, { status: s })}
          showLabel
          linkSummary={issue.linkSummary}
        />
      </span>

      {/* Content */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 text-sm block">{issue.title}</span>
        {issue.description && (
          <span className="line-clamp-1 text-[11px] text-muted-foreground mt-0.5 block">
            {issue.description.replace(/[\n\r]+/g, " ").slice(0, 120)}
          </span>
        )}

        {/* Meta row */}
        <span className="flex items-center gap-2 flex-wrap mt-0.5">
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          <span className="inline-flex items-center gap-1">
            <IssueTypePills issue={issue} className="inline-flex items-center gap-1 flex-wrap" />
            {templateIssueIds.has(issue.id) ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/40 bg-teal-500/10 px-1.5 py-0.5 text-[10px] text-teal-600 dark:text-teal-400">
                <Repeat className="h-2.5 w-2.5" />
                Template
              </span>
            ) : recurringIssueIds.has(issue.id) ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                <Clock3 className="h-2.5 w-2.5" />
                Recurring
              </span>
            ) : null}
            {spawnedFromTemplateIds.has(issue.id) && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
                <Copy className="h-2.5 w-2.5" />
                Scheduled
              </span>
            )}
            {liveIssueIds?.has(issue.id) && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10">
                <span className="relative flex h-2 w-2">
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
              </span>
            )}
            {!liveIssueIds?.has(issue.id) && failedRunMap?.has(issue.id) && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/10">
                <XCircle className="h-3 w-3 text-red-500" />
              </span>
            )}
          </span>
          {issue.linkSummary && (
            <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
              <DependencyPills issueId={issue.id} linkSummary={issue.linkSummary} />
            </span>
          )}
          <span className="text-xs text-muted-foreground">&middot;</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ActivityDot date={issue.updatedAt} />
            {timeAgo(issue.updatedAt)}
          </span>
        </span>
      </span>
    </Link>
  );
}
