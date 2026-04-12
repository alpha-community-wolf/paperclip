import type { Issue } from "@paperclipai/shared";
import { ListChecks, Map, Search, Workflow } from "lucide-react";
import { isWorkflowRootIssue } from "@/lib/issue-flow-ui";

type IssueTypePillsProps = {
  issue: Issue;
  className?: string;
};

/**
 * Flow type pills (Build / Plan / Explore) plus an optional Workflow pill when this
 * issue is the workflow container (metadata.workflowTemplateId, not a step).
 *
 * Workflow roots are stored as `type: task` — we show **Workflow** only for that case,
 * not **Build**, so the container is not double-labeled as task + workflow.
 */
export function IssueTypePills({ issue, className }: IssueTypePillsProps) {
  const showWorkflow = isWorkflowRootIssue(issue);

  return (
    <span className={className}>
      {showWorkflow && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 shrink-0">
          <Workflow className="h-3 w-3" />
          Workflow
        </span>
      )}
      {issue.type === "task" && !showWorkflow && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
          <ListChecks className="h-3 w-3" />
          Build
        </span>
      )}
      {issue.type === "plan" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 border border-violet-500/30 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 shrink-0">
          <Map className="h-3 w-3" />
          Plan
        </span>
      )}
      {issue.type === "explore" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
          <Search className="h-3 w-3" />
          Explore
        </span>
      )}
    </span>
  );
}
