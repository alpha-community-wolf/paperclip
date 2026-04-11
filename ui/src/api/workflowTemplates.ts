import { api } from "./client";

export interface WorkflowTemplate {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  steps: WorkflowStep[];
  variables: Record<string, VariableDeclaration>;
  version: number;
  isActive: boolean;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  key: string;
  title: string;
  type: "explore" | "plan" | "task";
  description?: string;
  assigneeAgentId?: string;
  priority?: "critical" | "high" | "medium" | "low";
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

export interface VariableDeclaration {
  type: "string" | "uuid";
  required: boolean;
  default?: string;
  description?: string;
}

export interface RunWorkflowResult {
  rootIssueId: string;
  rootIssueIdentifier: string;
  stepIssues: Array<{ key: string; issueId: string; status: string }>;
}

export const workflowTemplatesApi = {
  list: (companyId: string, includeInactive = false) => {
    const qs = includeInactive ? "?includeInactive=true" : "";
    return api.get<WorkflowTemplate[]>(
      `/companies/${encodeURIComponent(companyId)}/workflow-templates${qs}`,
    );
  },

  get: (id: string) =>
    api.get<WorkflowTemplate>(`/workflow-templates/${encodeURIComponent(id)}`),

  create: (companyId: string, data: { name: string; description?: string | null; steps: WorkflowStep[]; variables?: Record<string, VariableDeclaration> }) =>
    api.post<WorkflowTemplate>(`/companies/${encodeURIComponent(companyId)}/workflow-templates`, data),

  update: (id: string, data: Partial<{ name: string; description: string | null; steps: WorkflowStep[]; variables: Record<string, VariableDeclaration> }>) =>
    api.patch<WorkflowTemplate>(`/workflow-templates/${encodeURIComponent(id)}`, data),

  archive: (id: string) =>
    api.delete<{ ok: boolean }>(`/workflow-templates/${encodeURIComponent(id)}`),

  run: (id: string, data: { variables?: Record<string, string>; projectId?: string; goalId?: string; assigneeAgentId?: string }) =>
    api.post<RunWorkflowResult>(`/workflow-templates/${encodeURIComponent(id)}/run`, data),
};
