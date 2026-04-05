-- Shared memories table for company-wide and project-scoped knowledge
CREATE TABLE "shared_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,

  -- Scope: 'company' or 'project' (no 'team' — use project scope instead)
  "scope" text NOT NULL CHECK ("scope" IN ('company', 'project')),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,

  -- Content
  "content" text NOT NULL,
  "category" text NOT NULL CHECK ("category" IN (
    'fact', 'decision', 'procedure', 'preference', 'lesson_learned', 'context'
  )),
  "tags" text[] NOT NULL DEFAULT '{}',

  -- Provenance
  "source_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "source_issue_id" uuid REFERENCES "issues"("id") ON DELETE SET NULL,
  "source_run_id" uuid REFERENCES "heartbeat_runs"("id") ON DELETE SET NULL,
  "source_type" text CHECK ("source_type" IN ('agent_save', 'auto_capture', 'manual', 'propagated')),

  -- Quality & lifecycle
  "confidence" real NOT NULL DEFAULT 0.8 CHECK ("confidence" BETWEEN 0 AND 1),
  "verified_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "verified_at" timestamptz,
  "expires_at" timestamptz,
  "superseded_by" uuid,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'superseded', 'disputed', 'archived')),

  -- Usage tracking
  "access_count" integer NOT NULL DEFAULT 0,
  "last_accessed_at" timestamptz,

  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),

  -- project_id must be set for project-scoped memories, null for company-scoped
  CONSTRAINT "shared_memories_scope_project_check"
    CHECK (("scope" = 'project' AND "project_id" IS NOT NULL) OR ("scope" = 'company' AND "project_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "shared_memories_company_scope_status_idx" ON "shared_memories" USING btree ("company_id", "scope", "status");
--> statement-breakpoint
CREATE INDEX "shared_memories_project_idx" ON "shared_memories" ("project_id") WHERE "project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "shared_memories_source_agent_idx" ON "shared_memories" ("source_agent_id") WHERE "source_agent_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "shared_memories_tags_idx" ON "shared_memories" USING GIN ("tags");
--> statement-breakpoint
-- Full-text search index on content
ALTER TABLE "shared_memories" ADD COLUMN "content_search" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;
--> statement-breakpoint
CREATE INDEX "shared_memories_content_search_idx" ON "shared_memories" USING GIN ("content_search");
