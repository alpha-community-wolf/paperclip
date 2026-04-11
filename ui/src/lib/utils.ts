import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { deriveAgentUrlKey, deriveProjectUrlKey } from "@paperclipai/shared";
import { toCompanyRelativePath } from "./company-routes";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(date);
}

export function timeUntil(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffSec = Math.round((then - now) / 1000);
  if (diffSec <= 0) return "now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `in ${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `in ${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `in ${diffDay}d`;
  return formatDate(date);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Build an issue URL using the human-readable identifier when available. */
export function issueUrl(issue: { id: string; identifier?: string | null }): string {
  return `/issues/${issue.identifier ?? issue.id}`;
}

/** Build an agent route URL using the short URL key when available. */
export function agentRouteRef(agent: { id: string; urlKey?: string | null; name?: string | null }): string {
  return agent.urlKey ?? deriveAgentUrlKey(agent.name, agent.id);
}

/** Build an agent URL using the short URL key when available. */
export function agentUrl(agent: { id: string; urlKey?: string | null; name?: string | null }): string {
  return `/agents/${agentRouteRef(agent)}`;
}

const PRESERVED_AGENT_TABS = new Set(["dashboard", "configuration", "runs", "chat", "workspace"]);

/** Switch agents while preserving the current supported agent-detail tab. */
export function agentSwitchUrl(
  currentPath: string,
  agent: { id: string; urlKey?: string | null; name?: string | null },
): string {
  const relativePath = toCompanyRelativePath(currentPath);
  const match = relativePath.match(/^\/agents\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/);
  const nextAgentRef = agentRouteRef(agent);

  if (!match) {
    return `/agents/${nextAgentRef}/dashboard`;
  }

  const [, currentAgentRef, tab] = match;
  if (!currentAgentRef || currentAgentRef === "all" || currentAgentRef === "active" || currentAgentRef === "paused" || currentAgentRef === "error" || currentAgentRef === "new") {
    return `/agents/${nextAgentRef}/dashboard`;
  }

  if (tab && PRESERVED_AGENT_TABS.has(tab)) {
    return `/agents/${nextAgentRef}/${tab}`;
  }

  return `/agents/${nextAgentRef}/dashboard`;
}

/** Build a project route reference using the short URL key when available. */
export function projectRouteRef(project: { id: string; urlKey?: string | null; name?: string | null }): string {
  return project.urlKey ?? deriveProjectUrlKey(project.name, project.id);
}

/** Build a project URL using the short URL key when available. */
export function projectUrl(project: { id: string; urlKey?: string | null; name?: string | null }): string {
  return `/projects/${projectRouteRef(project)}`;
}

const FLOW_TITLE_PREFIX_PATTERN = /^(?:explore|plan|build):\s*|^build plan\s+/i;

export function deriveFlowIssueTitle(prefix: "Plan" | "Build", sourceTitle?: string | null): string {
  const normalizedSource = (sourceTitle ?? "").trim().replace(FLOW_TITLE_PREFIX_PATTERN, "").trim();
  return normalizedSource ? `${prefix}: ${normalizedSource}` : `${prefix}: Untitled`;
}

export type ActivityLevel = "hot" | "warm" | "cold" | "stale";

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const TWO_DAYS = 2 * ONE_DAY;

/** Classify issue activity recency into hot/warm/cold/stale. */
export function activityLevel(date: Date | string): ActivityLevel {
  const age = Date.now() - new Date(date).getTime();
  if (age < FOUR_HOURS) return "hot";
  if (age < ONE_DAY) return "warm";
  if (age < TWO_DAYS) return "cold";
  return "stale";
}

export const activityConfig: Record<ActivityLevel, { label: string; className: string }> = {
  hot: { label: "Active", className: "text-orange-500" },
  warm: { label: "Recent", className: "text-yellow-500 dark:text-yellow-400" },
  cold: { label: "Cooling", className: "text-blue-400" },
  stale: { label: "Stale", className: "text-muted-foreground/50" },
};
