import { z } from "zod";

export const SHARED_MEMORY_SCOPES = ["company", "project"] as const;
export const SHARED_MEMORY_CATEGORIES = [
  "fact",
  "decision",
  "procedure",
  "preference",
  "lesson_learned",
  "context",
] as const;
export const SHARED_MEMORY_STATUSES = ["active", "superseded", "disputed", "archived"] as const;
export const SHARED_MEMORY_SOURCE_TYPES = ["agent_save", "auto_capture", "manual", "propagated"] as const;

export const createSharedMemorySchema = z.object({
  content: z.string().min(1).max(4000),
  scope: z.enum(SHARED_MEMORY_SCOPES),
  projectId: z.string().uuid().optional().nullable(),
  category: z.enum(SHARED_MEMORY_CATEGORIES),
  tags: z.array(z.string().max(64)).max(20).optional().default([]),
  confidence: z.number().min(0).max(1).optional().default(0.8),
  sourceIssueId: z.string().uuid().optional().nullable(),
  sourceType: z.enum(SHARED_MEMORY_SOURCE_TYPES).optional().default("agent_save"),
});

export type CreateSharedMemory = z.infer<typeof createSharedMemorySchema>;

export const updateSharedMemorySchema = z.object({
  content: z.string().min(1).max(4000).optional(),
  category: z.enum(SHARED_MEMORY_CATEGORIES).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: z.enum(SHARED_MEMORY_STATUSES).optional(),
  supersededBy: z.string().uuid().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type UpdateSharedMemory = z.infer<typeof updateSharedMemorySchema>;

export const searchSharedMemoryQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  scope: z.enum(SHARED_MEMORY_SCOPES).optional(),
  projectId: z.string().uuid().optional(),
  category: z.enum(SHARED_MEMORY_CATEGORIES).optional(),
  status: z.enum(SHARED_MEMORY_STATUSES).optional().default("active"),
  tags: z.string().optional(), // comma-separated
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type SearchSharedMemoryQuery = z.infer<typeof searchSharedMemoryQuerySchema>;

export const verifySharedMemorySchema = z.object({
  agentId: z.string().uuid(),
});

export type VerifySharedMemory = z.infer<typeof verifySharedMemorySchema>;
