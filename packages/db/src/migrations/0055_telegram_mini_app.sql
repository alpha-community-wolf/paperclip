-- Telegram Mini App support: user mapping + config toggle

-- Add optional telegram_user_id to auth users for Mini App auth mapping
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "telegram_user_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "user_telegram_user_id_idx" ON "user" ("telegram_user_id") WHERE "telegram_user_id" IS NOT NULL;

-- Add mini_app_enabled flag and custom URL to telegram configs
ALTER TABLE "agent_telegram_configs" ADD COLUMN IF NOT EXISTS "mini_app_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "agent_telegram_configs" ADD COLUMN IF NOT EXISTS "mini_app_url" text;
