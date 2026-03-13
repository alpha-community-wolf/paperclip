export type SkillTier = "built_in" | "company" | "agent";
export type SkillSourceType = "bundled" | "git" | "local";

export interface Skill {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  tier: SkillTier;
  defaultEnabled: boolean;
  agentId: string | null;
  sourceType: SkillSourceType;
  sourceUrl: string | null;
  installedPath: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSkillAssignment {
  agentId: string;
  skillId: string;
  companyId: string;
  createdAt: string;
}

export interface ResolvedSkill {
  name: string;
  tier: SkillTier;
  path: string;
}
