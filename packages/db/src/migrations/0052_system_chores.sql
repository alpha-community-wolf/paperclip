-- System chore configs: per-company configuration for platform-level background tasks
CREATE TABLE "system_chore_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "chore_key" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "expression" text,
  "timezone" text,
  "adapter_type" text,
  "model" text,
  "config" jsonb NOT NULL DEFAULT '{}',
  "last_run_at" timestamptz,
  "next_run_at" timestamptz,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("company_id", "chore_key")
);
--> statement-breakpoint
CREATE INDEX "system_chore_configs_company_enabled_next_idx"
  ON "system_chore_configs" ("company_id", "enabled", "next_run_at");
--> statement-breakpoint

-- Extend heartbeat_runs for system chore runs
ALTER TABLE "heartbeat_runs" ADD COLUMN "system_chore_key" text;
--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ALTER COLUMN "agent_id" DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX "heartbeat_runs_system_chore_idx"
  ON "heartbeat_runs" ("company_id", "system_chore_key", "started_at")
  WHERE "system_chore_key" IS NOT NULL;
