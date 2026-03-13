import type { Skill, AgentSkillAssignment } from "@paperclipai/shared";
import { api } from "./client";

function agentSkillPath(agentId: string, companyId?: string, suffix = "") {
  const base = `/agents/${encodeURIComponent(agentId)}${suffix}`;
  if (!companyId) return base;
  return `${base}${base.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
}

export const skillsApi = {
  list: (companyId: string) =>
    api.get<Skill[]>(`/companies/${companyId}/skills`),

  get: (id: string) =>
    api.get<Skill>(`/skills/${encodeURIComponent(id)}`),

  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Skill>(`/companies/${companyId}/skills`, data),

  remove: (id: string) =>
    api.delete<{ ok: boolean }>(`/skills/${encodeURIComponent(id)}`),

  listForAgent: (agentId: string, companyId?: string) =>
    api.get<Skill[]>(agentSkillPath(agentId, companyId, "/skills")),

  listAssignmentsForAgent: (agentId: string, companyId?: string) =>
    api.get<AgentSkillAssignment[]>(agentSkillPath(agentId, companyId, "/skill-assignments")),

  assignToAgent: (agentId: string, skillId: string, companyId?: string) =>
    api.post<{ ok: boolean }>(agentSkillPath(agentId, companyId, `/skills/${encodeURIComponent(skillId)}/assign`), {}),

  unassignFromAgent: (agentId: string, skillId: string, companyId?: string) =>
    api.delete<{ ok: boolean }>(agentSkillPath(agentId, companyId, `/skills/${encodeURIComponent(skillId)}/assign`)),

  install: (companyId: string, data: { command: string; tier?: string; agentId?: string | null; targetDir?: string | null }) =>
    api.post<{ installed: Skill[]; stdout: string; stderr: string }>(`/companies/${companyId}/skills/install`, data),
};
