-- Phase 1: Add reviewer/approver columns to issues
ALTER TABLE "issues" ADD COLUMN "reviewer_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL;
ALTER TABLE "issues" ADD COLUMN "reviewer_user_id" text;
ALTER TABLE "issues" ADD COLUMN "approver_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL;
ALTER TABLE "issues" ADD COLUMN "approver_user_id" text;

-- Phase 2: Add decided_by_agent_id to review bundles
ALTER TABLE "issue_review_bundles" ADD COLUMN "decided_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL;
