CREATE TABLE "commands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "trigger" text NOT NULL,
  "label" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "commands_company_idx" ON "commands" ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "commands_company_trigger_unique" ON "commands" ("company_id", "trigger");
