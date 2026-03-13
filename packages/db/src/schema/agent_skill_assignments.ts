import { pgTable, uuid, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { skills } from "./skills.js";

export const agentSkillAssignments = pgTable(
  "agent_skill_assignments",
  {
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.agentId, table.skillId], name: "agent_skill_assignments_pk" }),
    agentIdx: index("agent_skill_assignments_agent_idx").on(table.agentId),
    skillIdx: index("agent_skill_assignments_skill_idx").on(table.skillId),
  }),
);
