ALTER TABLE "agent_telegram_configs" ADD COLUMN "require_mention" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_telegram_configs" ADD COLUMN "mention_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL;
