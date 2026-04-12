-- System Chores V2: add columns to support user-created (custom) chores
ALTER TABLE "system_chore_configs" ADD COLUMN "chore_type" text NOT NULL DEFAULT 'built_in';
--> statement-breakpoint
ALTER TABLE "system_chore_configs" ADD COLUMN "display_name" text;
--> statement-breakpoint
ALTER TABLE "system_chore_configs" ADD COLUMN "display_description" text;
--> statement-breakpoint
ALTER TABLE "system_chore_configs" ADD COLUMN "created_by_user_id" text REFERENCES "user"("id");
--> statement-breakpoint
ALTER TABLE "system_chore_configs" ADD COLUMN "deleted_at" timestamptz;
