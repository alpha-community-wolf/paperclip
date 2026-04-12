import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { authUsers } from "./auth.js";

export const systemChoreConfigs = pgTable(
  "system_chore_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    choreKey: text("chore_key").notNull(),
    choreType: text("chore_type").notNull().default("built_in"),
    enabled: boolean("enabled").notNull().default(true),
    expression: text("expression"),
    timezone: text("timezone"),
    adapterType: text("adapter_type"),
    model: text("model"),
    displayName: text("display_name"),
    displayDescription: text("display_description"),
    config: jsonb("config").notNull().default({}),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastError: text("last_error"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyChoreUnique: unique("system_chore_configs_company_id_chore_key_key").on(table.companyId, table.choreKey),
    companyEnabledNextIdx: index("system_chore_configs_company_enabled_next_idx").on(
      table.companyId,
      table.enabled,
      table.nextRunAt,
    ),
  }),
);
