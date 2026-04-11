import { z } from "zod";

const stepKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Step key must use lowercase letters, numbers, hyphens, and underscores");

const workflowStepSchema = z.object({
  key: stepKeySchema,
  title: z.string().trim().min(1).max(255),
  type: z.enum(["explore", "plan", "task"]),
  description: z.string().max(4000).optional(),
  assigneeAgentId: z.string().uuid().optional().or(z.string().regex(/^\{\{.*\}\}$/)),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  dependsOn: z.array(stepKeySchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const variableDeclarationSchema = z.object({
  type: z.enum(["string", "uuid"]),
  required: z.boolean().optional().default(true),
  default: z.string().optional(),
  description: z.string().max(500).optional(),
});

export const createWorkflowTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).nullish(),
  steps: z.array(workflowStepSchema).min(1).max(20),
  variables: z.record(variableDeclarationSchema).optional(),
});

export type CreateWorkflowTemplate = z.infer<typeof createWorkflowTemplateSchema>;

export const updateWorkflowTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).nullish(),
  steps: z.array(workflowStepSchema).min(1).max(20).optional(),
  variables: z.record(variableDeclarationSchema).optional(),
});

export type UpdateWorkflowTemplate = z.infer<typeof updateWorkflowTemplateSchema>;

export const runWorkflowTemplateSchema = z.object({
  variables: z.record(z.string()).optional(),
  projectId: z.string().uuid().optional(),
  goalId: z.string().uuid().optional(),
  assigneeAgentId: z.string().uuid().optional(),
});

export type RunWorkflowTemplate = z.infer<typeof runWorkflowTemplateSchema>;
