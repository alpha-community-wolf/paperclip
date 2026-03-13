import { z } from "zod";

export const createSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  tier: z.enum(["company", "agent"]),
  agentId: z.string().uuid().optional().nullable(),
  sourceType: z.enum(["bundled", "git", "local"]).optional().default("local"),
  sourceUrl: z.string().optional().nullable(),
  installedPath: z.string().min(1),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateSkill = z.infer<typeof createSkillSchema>;

export const installSkillSchema = z.object({
  command: z.string().min(1),
  tier: z.enum(["company", "agent"]).optional().default("company"),
  agentId: z.string().uuid().optional().nullable(),
  targetDir: z.string().optional().nullable(),
});

export type InstallSkill = z.infer<typeof installSkillSchema>;
