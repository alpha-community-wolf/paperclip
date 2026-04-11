CREATE TABLE "workflow_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "steps" jsonb NOT NULL,
  "variables" jsonb NOT NULL DEFAULT '{}',
  "version" integer NOT NULL DEFAULT 1,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "created_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "workflow_templates_company_idx" ON "workflow_templates" ("company_id");
--> statement-breakpoint
CREATE INDEX "workflow_templates_company_active_idx" ON "workflow_templates" ("company_id", "is_active");
