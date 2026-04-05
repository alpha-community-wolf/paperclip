import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const issueReviewBundles = pgTable(
  "issue_review_bundles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    requestedReviewerUserId: text("requested_reviewer_user_id"),
    submittedByAgentId: uuid("submitted_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    submittedByUserId: text("submitted_by_user_id"),
    decidedByUserId: text("decided_by_user_id"),
    decidedByAgentId: uuid("decided_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    summary: text("summary").notNull().default(""),
    deliverable: text("deliverable").notNull().default(""),
    testingNotes: text("testing_notes"),
    riskNotes: text("risk_notes"),
    followUpNotes: text("follow_up_notes"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    linkedRunId: uuid("linked_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    decisionNote: text("decision_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("issue_review_bundles_company_status_idx").on(table.companyId, table.status),
    issueIdx: uniqueIndex("issue_review_bundles_issue_idx").on(table.issueId),
  }),
);
