import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { inboxDismissals } from "@paperclipai/db";
import type { InboxDismissalItemType } from "@paperclipai/shared";

export function inboxDismissalService(db: Db) {
  return {
    listByUser: async (companyId: string, userId: string) => {
      return db
        .select()
        .from(inboxDismissals)
        .where(and(eq(inboxDismissals.companyId, companyId), eq(inboxDismissals.userId, userId)));
    },

    listItemIdsByType: async (companyId: string, userId: string, itemType: InboxDismissalItemType) => {
      const rows = await db
        .select({ itemId: inboxDismissals.itemId })
        .from(inboxDismissals)
        .where(
          and(
            eq(inboxDismissals.companyId, companyId),
            eq(inboxDismissals.userId, userId),
            eq(inboxDismissals.itemType, itemType),
          ),
        );
      return rows.map((row) => row.itemId);
    },

    dismiss: async (companyId: string, userId: string, itemType: InboxDismissalItemType, itemId: string) => {
      const now = new Date();
      const [row] = await db
        .insert(inboxDismissals)
        .values({ companyId, userId, itemType, itemId, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [
            inboxDismissals.companyId,
            inboxDismissals.userId,
            inboxDismissals.itemType,
            inboxDismissals.itemId,
          ],
          set: { updatedAt: now },
        })
        .returning();
      return row ?? null;
    },

    undismiss: async (companyId: string, userId: string, itemType: InboxDismissalItemType, itemId: string) => {
      const [row] = await db
        .delete(inboxDismissals)
        .where(
          and(
            eq(inboxDismissals.companyId, companyId),
            eq(inboxDismissals.userId, userId),
            eq(inboxDismissals.itemType, itemType),
            eq(inboxDismissals.itemId, itemId),
          ),
        )
        .returning();
      return row ?? null;
    },
  };
}

