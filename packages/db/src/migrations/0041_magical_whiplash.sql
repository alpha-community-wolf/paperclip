CREATE TABLE "chat_read_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"chat_session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"link_type" text DEFAULT 'triggers' NOT NULL,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_links_unique" UNIQUE("source_id","target_id","link_type")
);
--> statement-breakpoint
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_source_id_issues_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_target_id_issues_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_read_states_company_session_idx" ON "chat_read_states" USING btree ("company_id","chat_session_id");--> statement-breakpoint
CREATE INDEX "chat_read_states_company_user_idx" ON "chat_read_states" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_read_states_company_session_user_idx" ON "chat_read_states" USING btree ("company_id","chat_session_id","user_id");--> statement-breakpoint
CREATE INDEX "issue_links_source_idx" ON "issue_links" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "issue_links_target_idx" ON "issue_links" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "issue_links_company_idx" ON "issue_links" USING btree ("company_id");