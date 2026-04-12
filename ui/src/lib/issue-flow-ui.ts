import type { Issue } from "@paperclipai/shared";

/** Workflow root container: template attached, not a generated step issue. */
export function isWorkflowRootIssue(issue: Issue): boolean {
  const m = issue.metadata as Record<string, unknown> | null | undefined;
  if (!m?.workflowTemplateId) return false;
  return !m.workflowStepKey;
}

/** Any issue created or linked by a workflow template (root or step). */
export function isWorkflowManagedIssue(issue: Issue): boolean {
  const m = issue.metadata as Record<string, unknown> | null | undefined;
  return Boolean(m?.workflowTemplateId);
}
