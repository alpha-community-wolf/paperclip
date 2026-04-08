import { z } from "zod";

export const commandTriggerSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Trigger must use lowercase letters, numbers, and hyphens");

export const createCommandSchema = z.object({
  trigger: commandTriggerSchema,
  label: z.string().trim().min(1).max(120),
  content: z.string().min(1).max(8000),
});

export type CreateCommand = z.infer<typeof createCommandSchema>;

export const updateCommandSchema = z.object({
  trigger: commandTriggerSchema.optional(),
  label: z.string().trim().min(1).max(120).optional(),
  content: z.string().min(1).max(8000).optional(),
});

export type UpdateCommand = z.infer<typeof updateCommandSchema>;
