import { pgTable, uuid, text, real, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";
import { projects } from "./projects.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const sharedMemories = pgTable(
  "shared_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),

    // Scope
    scope: text("scope").notNull(), // 'company' | 'project'
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),

    // Content
    content: text("content").notNull(),
    category: text("category").notNull(), // 'fact' | 'decision' | 'procedure' | 'preference' | 'lesson_learned' | 'context'
    tags: text("tags").array().notNull().default([]),

    // Provenance
    sourceAgentId: uuid("source_agent_id").references(() => agents.id, { onDelete: "set null" }),
    sourceIssueId: uuid("source_issue_id").references(() => issues.id, { onDelete: "set null" }),
    sourceRunId: uuid("source_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    sourceType: text("source_type"), // 'agent_save' | 'auto_capture' | 'manual' | 'propagated'

    // Quality & lifecycle
    confidence: real("confidence").notNull().default(0.8),
    verifiedByAgentId: uuid("verified_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    supersededBy: uuid("superseded_by"), // self-ref, no FK constraint to avoid circular issues
    status: text("status").notNull().default("active"), // 'active' | 'superseded' | 'disputed' | 'archived'

    // Usage tracking
    accessCount: integer("access_count").notNull().default(0),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyScopeStatusIdx: index("shared_memories_company_scope_status_idx").on(
      table.companyId,
      table.scope,
      table.status,
    ),
    projectIdx: index("shared_memories_project_idx").on(table.projectId),
    sourceAgentIdx: index("shared_memories_source_agent_idx").on(table.sourceAgentId),
  }),
);
