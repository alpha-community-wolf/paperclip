import { z } from "zod";

export const upsertTelegramConfigSchema = z.object({
  botToken: z.string().trim().min(10, "Bot token is required"),
  enabled: z.boolean().optional().default(false),
  allowedUserIds: z.array(z.string().trim().min(1)).optional().default([]),
});

export const updateTelegramConfigSchema = z.object({
  botToken: z.string().trim().min(10).optional(),
  enabled: z.boolean().optional(),
  allowedUserIds: z.array(z.string().trim().min(1)).optional(),
});

export type UpsertTelegramConfig = z.infer<typeof upsertTelegramConfigSchema>;
export type UpdateTelegramConfig = z.infer<typeof updateTelegramConfigSchema>;
