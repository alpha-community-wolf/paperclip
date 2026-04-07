import { api } from "./client";

export interface SystemChoreConfig {
  id: string;
  enabled: boolean;
  expression: string;
  timezone: string;
  model: string | null;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  nextRunAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface SystemChoreType {
  key: string;
  name: string;
  description: string;
  defaults: {
    expression: string;
    timezone: string;
    enabled: boolean;
  };
  config: SystemChoreConfig | null;
}

export interface SystemChoreRun {
  id: string;
  systemChoreKey: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  resultJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface SystemChoreConfigUpdate {
  enabled?: boolean;
  expression?: string;
  timezone?: string;
  model?: string | null;
  config?: Record<string, unknown>;
}

export const systemChoresApi = {
  list: (companyId: string) =>
    api.get<SystemChoreType[]>(`/companies/${encodeURIComponent(companyId)}/system-chores`),

  updateConfig: (companyId: string, choreKey: string, input: SystemChoreConfigUpdate) =>
    api.patch<SystemChoreConfig>(
      `/companies/${encodeURIComponent(companyId)}/system-chores/${encodeURIComponent(choreKey)}`,
      input,
    ),

  trigger: (companyId: string, choreKey: string) =>
    api.post<{ runId: string }>(
      `/companies/${encodeURIComponent(companyId)}/system-chores/${encodeURIComponent(choreKey)}/trigger`,
      {},
    ),

  listRuns: (companyId: string, choreKey?: string, limit = 50) =>
    api.get<SystemChoreRun[]>(
      `/companies/${encodeURIComponent(companyId)}/system-chore-runs?${new URLSearchParams({
        ...(choreKey ? { choreKey } : {}),
        limit: String(limit),
      })}`,
    ),
};
