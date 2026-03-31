ALTER TABLE "cost_events" ADD COLUMN "run_id" uuid;
--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cost_events_company_run_idx" ON "cost_events" USING btree ("company_id", "run_id");
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "budget_alert_thresholds" jsonb;
