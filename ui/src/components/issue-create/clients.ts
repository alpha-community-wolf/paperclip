import type { Agent, AssetImage, Issue, Project } from "@paperclipai/shared";
import { agentsApi, type AdapterModel } from "../../api/agents";
import { issuesApi } from "../../api/issues";
import { projectsApi } from "../../api/projects";
import { taskCronsApi, type TaskCronScheduleInput } from "../../api/taskCrons";
import { workflowTemplatesApi, type RunWorkflowResult, type WorkflowTemplate } from "../../api/workflowTemplates";
import { assetsApi } from "../../api/assets";
import { miniAppApi } from "../../mini-app/api/client";

export interface IssueCreateClients {
  listAgents: (companyId: string) => Promise<Agent[]>;
  listProjects: (companyId: string) => Promise<Project[]>;
  listWorkflowTemplates: (companyId: string) => Promise<WorkflowTemplate[]>;
  adapterModels: (companyId: string, adapterType: string) => Promise<AdapterModel[]>;
  createIssue: (companyId: string, data: Record<string, unknown>) => Promise<Issue>;
  createIssueSchedule: (
    issueId: string,
    input: TaskCronScheduleInput,
    companyId?: string,
  ) => Promise<unknown>;
  runWorkflow: (templateId: string, body: { rootIssueId: string }) => Promise<RunWorkflowResult>;
  uploadImage: (companyId: string, file: File, namespace?: string) => Promise<AssetImage>;
}

export const boardIssueCreateClients: IssueCreateClients = {
  listAgents: agentsApi.list,
  listProjects: projectsApi.list,
  listWorkflowTemplates: workflowTemplatesApi.list,
  adapterModels: agentsApi.adapterModels,
  createIssue: issuesApi.create,
  createIssueSchedule: taskCronsApi.createIssueSchedule,
  runWorkflow: workflowTemplatesApi.run,
  uploadImage: assetsApi.uploadImage,
};

export const miniAppIssueCreateClients: IssueCreateClients = {
  listAgents: (companyId) => miniAppApi.get<Agent[]>(`/companies/${encodeURIComponent(companyId)}/agents`),
  listProjects: (companyId) => miniAppApi.get<Project[]>(`/companies/${encodeURIComponent(companyId)}/projects`),
  listWorkflowTemplates: (companyId) =>
    miniAppApi.get<WorkflowTemplate[]>(
      `/companies/${encodeURIComponent(companyId)}/workflow-templates`,
    ),
  adapterModels: (companyId, adapterType) =>
    miniAppApi.get<AdapterModel[]>(
      `/companies/${encodeURIComponent(companyId)}/adapters/${encodeURIComponent(adapterType)}/models`,
    ),
  createIssue: (companyId, data) =>
    miniAppApi.post<Issue>(`/companies/${encodeURIComponent(companyId)}/issues`, data),
  createIssueSchedule: (issueId, input, companyId) => {
    const suffix = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    return miniAppApi.post<unknown>(
      `/issues/${encodeURIComponent(issueId)}/task-cron-schedules${suffix}`,
      input,
    );
  },
  runWorkflow: (templateId, body) =>
    miniAppApi.post<RunWorkflowResult>(
      `/workflow-templates/${encodeURIComponent(templateId)}/run`,
      body,
    ),
  uploadImage: async (companyId, file, namespace) => {
    const buffer = await file.arrayBuffer();
    const safeFile = new File([buffer], file.name, { type: file.type });
    const form = new FormData();
    form.append("file", safeFile);
    if (namespace && namespace.trim().length > 0) {
      form.append("namespace", namespace.trim());
    }
    return miniAppApi.postForm<AssetImage>(
      `/companies/${encodeURIComponent(companyId)}/assets/images`,
      form,
    );
  },
};
