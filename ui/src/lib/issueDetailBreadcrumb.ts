type IssueDetailBreadcrumb = {
  label: string;
  href: string;
};

type FromRun = {
  runId: string;
  agentRouteId: string;
  label: string;
};

type IssueDetailLocationState = {
  issueDetailBreadcrumb?: IssueDetailBreadcrumb;
  fromRun?: FromRun;
};

function isIssueDetailBreadcrumb(value: unknown): value is IssueDetailBreadcrumb {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<IssueDetailBreadcrumb>;
  return typeof candidate.label === "string" && typeof candidate.href === "string";
}

function isFromRun(value: unknown): value is FromRun {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FromRun>;
  return typeof candidate.runId === "string" && typeof candidate.agentRouteId === "string" && typeof candidate.label === "string";
}

export function createIssueDetailLocationState(label: string, href: string): IssueDetailLocationState {
  return { issueDetailBreadcrumb: { label, href } };
}

export function readIssueDetailBreadcrumb(state: unknown): IssueDetailBreadcrumb | null {
  if (typeof state !== "object" || state === null) return null;
  const candidate = (state as IssueDetailLocationState).issueDetailBreadcrumb;
  return isIssueDetailBreadcrumb(candidate) ? candidate : null;
}

export function readFromRun(state: unknown): FromRun | null {
  if (typeof state !== "object" || state === null) return null;
  const candidate = (state as IssueDetailLocationState).fromRun;
  return isFromRun(candidate) ? candidate : null;
}
