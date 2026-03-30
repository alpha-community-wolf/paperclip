import { z } from "zod";

export const upsertTelegramConfigSchema = z.object({
  botToken: z.string().trim().min(10, "Bot token is required"),
  enabled: z.boolean().optional().default(false),
  allowedUserIds: z.array(z.string().trim().min(1)).optional().default([]),
  requireMention: z.boolean().optional().default(true),
  mentionPatterns: z.array(z.string().trim().min(1)).optional().default([]),
});

export const updateTelegramConfigSchema = z.object({
  botToken: z.string().trim().min(10).optional(),
  enabled: z.boolean().optional(),
  ownerChatId: z.string().trim().min(1).optional().nullable(),
  allowedUserIds: z.array(z.string().trim().min(1)).optional(),
  requireMention: z.boolean().optional(),
  mentionPatterns: z.array(z.string().trim().min(1)).optional(),
});

export const sendTelegramMessageSchema = z.object({
  text: z.string().trim().min(1).optional(),
  sessionId: z.string().uuid().optional(),
  mediaType: z.enum(["photo", "document"]).optional(),
  mediaUrl: z.string().url().optional(),
  mediaPath: z.string().min(1).optional(),
  caption: z.string().trim().optional(),
}).refine(
  (d) => d.text || d.mediaType,
  { message: "Either text or mediaType is required" },
).refine(
  (d) => !d.mediaType || d.mediaUrl || d.mediaPath,
  { message: "Either mediaUrl or mediaPath is required when mediaType is set" },
);

export type UpsertTelegramConfig = z.infer<typeof upsertTelegramConfigSchema>;
export type UpdateTelegramConfig = z.infer<typeof updateTelegramConfigSchema>;
export type SendTelegramMessage = z.infer<typeof sendTelegramMessageSchema>;
