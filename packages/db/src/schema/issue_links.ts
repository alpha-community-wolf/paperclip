import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";

export const issueLinks = pgTable(
  "issue_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    targetId: uuid("target_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    linkType: text("link_type").notNull().default("triggers"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueLink: unique("issue_links_unique").on(table.sourceId, table.targetId, table.linkType),
    sourceIdx: index("issue_links_source_idx").on(table.sourceId),
    targetIdx: index("issue_links_target_idx").on(table.targetId),
    companyIdx: index("issue_links_company_idx").on(table.companyId),
  }),
);
