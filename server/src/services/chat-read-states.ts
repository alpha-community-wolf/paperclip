import { and, eq, sql, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { chatReadStates, chatMessages, chatSessions } from "@paperclipai/db";

export function chatReadStateService(db: Db) {
  return {
    markRead: async (companyId: string, chatSessionId: string, userId: string) => {
      const now = new Date();
      const [row] = await db
        .insert(chatReadStates)
        .values({ companyId, chatSessionId, userId, lastReadAt: now, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [chatReadStates.companyId, chatReadStates.chatSessionId, chatReadStates.userId],
          set: { lastReadAt: now, updatedAt: now },
        })
        .returning();
      return row ?? null;
    },

    countUnreadSessions: async (companyId: string, userId: string) => {
      // Count non-archived sessions where at least one assistant message
      // is newer than the user's last-read timestamp (or no read state exists).
      const [row] = await db
        .select({ count: sql<number>`count(DISTINCT ${chatSessions.id})` })
        .from(chatSessions)
        .innerJoin(
          chatMessages,
          and(
            eq(chatMessages.chatSessionId, chatSessions.id),
            eq(chatMessages.role, "assistant"),
          ),
        )
        .leftJoin(
          chatReadStates,
          and(
            eq(chatReadStates.chatSessionId, chatSessions.id),
            eq(chatReadStates.userId, userId),
            eq(chatReadStates.companyId, companyId),
          ),
        )
        .where(
          and(
            eq(chatSessions.companyId, companyId),
            isNull(chatSessions.archivedAt),
            sql`(${chatReadStates.id} IS NULL OR ${chatMessages.createdAt} > ${chatReadStates.lastReadAt})`,
          ),
        );
      return Number(row?.count ?? 0);
    },

    /** Per-agent unread session counts for the sidebar / chat page agent list. */
    countUnreadSessionsByAgent: async (companyId: string, userId: string) => {
      const rows = await db
        .select({
          agentId: chatSessions.agentId,
          count: sql<number>`count(DISTINCT ${chatSessions.id})`,
        })
        .from(chatSessions)
        .innerJoin(
          chatMessages,
          and(
            eq(chatMessages.chatSessionId, chatSessions.id),
            eq(chatMessages.role, "assistant"),
          ),
        )
        .leftJoin(
          chatReadStates,
          and(
            eq(chatReadStates.chatSessionId, chatSessions.id),
            eq(chatReadStates.userId, userId),
            eq(chatReadStates.companyId, companyId),
          ),
        )
        .where(
          and(
            eq(chatSessions.companyId, companyId),
            isNull(chatSessions.archivedAt),
            sql`(${chatReadStates.id} IS NULL OR ${chatMessages.createdAt} > ${chatReadStates.lastReadAt})`,
          ),
        )
        .groupBy(chatSessions.agentId);

      const result: Record<string, number> = {};
      for (const row of rows) {
        result[row.agentId] = Number(row.count);
      }
      return result;
    },

    /** Returns IDs of unread sessions for a specific agent. */
    listUnreadSessionIds: async (companyId: string, userId: string, agentId: string) => {
      const rows = await db
        .selectDistinct({ sessionId: chatSessions.id })
        .from(chatSessions)
        .innerJoin(
          chatMessages,
          and(
            eq(chatMessages.chatSessionId, chatSessions.id),
            eq(chatMessages.role, "assistant"),
          ),
        )
        .leftJoin(
          chatReadStates,
          and(
            eq(chatReadStates.chatSessionId, chatSessions.id),
            eq(chatReadStates.userId, userId),
            eq(chatReadStates.companyId, companyId),
          ),
        )
        .where(
          and(
            eq(chatSessions.companyId, companyId),
            eq(chatSessions.agentId, agentId),
            isNull(chatSessions.archivedAt),
            sql`(${chatReadStates.id} IS NULL OR ${chatMessages.createdAt} > ${chatReadStates.lastReadAt})`,
          ),
        );
      return rows.map((r) => r.sessionId);
    },
  };
}
