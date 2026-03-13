import { boolean, pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    tier: text("tier").notNull(), // "built_in" | "company" | "agent"
    defaultEnabled: boolean("default_enabled").notNull().default(true),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull().default("bundled"), // "bundled" | "git" | "local"
    sourceUrl: text("source_url"),
    installedPath: text("installed_path").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTierIdx: index("skills_company_tier_idx").on(table.companyId, table.tier),
    agentIdx: index("skills_agent_idx").on(table.agentId),
    companyNameUnique: uniqueIndex("skills_company_name_unique_idx").on(table.companyId, table.name),
  }),
);
