import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const inboxDismissals = pgTable(
  "inbox_dismissals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: text("user_id").notNull(),
    itemType: text("item_type").notNull(),
    itemId: text("item_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserTypeIdx: index("inbox_dismissals_company_user_type_idx").on(
      table.companyId,
      table.userId,
      table.itemType,
      table.createdAt,
    ),
    companyUserTypeItemUnique: uniqueIndex("inbox_dismissals_company_user_type_item_uidx").on(
      table.companyId,
      table.userId,
      table.itemType,
      table.itemId,
    ),
  }),
);

