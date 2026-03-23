import { describe, expect, it } from "vitest";
import type { ChatSession } from "@paperclipai/shared";
import { displaySessionTitle, filterChatSessions, groupChatSessions } from "./chat-sessions";

function makeSession(overrides: Partial<ChatSession>): ChatSession {
  return {
    id: overrides.id ?? "session-id",
    companyId: overrides.companyId ?? "company-id",
    agentId: overrides.agentId ?? "agent-id",
    taskKey: overrides.taskKey ?? "chat:session-id",
    title: overrides.title ?? null,
    createdByUserId: overrides.createdByUserId ?? null,
    createdByAgentId: overrides.createdByAgentId ?? null,
    archivedAt: overrides.archivedAt ?? null,
    lastMessageAt: overrides.lastMessageAt ?? null,
    lastRunId: overrides.lastRunId ?? null,
    telegramChatId: overrides.telegramChatId ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-03-17T00:00:00.000Z"),
  };
}

describe("chat session helpers", () => {
  it("uses Untitled fallback for blank titles", () => {
    expect(displaySessionTitle(makeSession({ title: null }))).toBe("Untitled");
    expect(displaySessionTitle(makeSession({ title: "   " }))).toBe("Untitled");
    expect(displaySessionTitle(makeSession({ title: "Roadmap thread" }))).toBe("Roadmap thread");
  });

  it("filters sessions by title with fallback support", () => {
    const sessions = [
      makeSession({ id: "a", title: "Sprint planning" }),
      makeSession({ id: "b", title: null }),
    ];
    expect(filterChatSessions(sessions, "sprint").map((session) => session.id)).toEqual(["a"]);
    expect(filterChatSessions(sessions, "untitled").map((session) => session.id)).toEqual(["b"]);
  });

  it("groups sessions by open/recent/older/archived", () => {
    const now = new Date("2026-03-17T12:00:00.000Z");
    const grouped = groupChatSessions(
      [
        makeSession({ id: "active", title: "Current", updatedAt: new Date("2026-03-17T11:00:00.000Z") }),
        makeSession({ id: "recent", title: "Recent", updatedAt: new Date("2026-03-14T11:00:00.000Z") }),
        makeSession({ id: "older", title: "Older", updatedAt: new Date("2026-02-21T11:00:00.000Z") }),
        makeSession({
          id: "archived",
          title: "Archived",
          updatedAt: new Date("2026-03-15T11:00:00.000Z"),
          archivedAt: new Date("2026-03-16T00:00:00.000Z"),
        }),
      ],
      { now, activeSessionId: "active" },
    );
    expect(grouped.open.map((session) => session.id)).toEqual(["active"]);
    expect(grouped.previous7Days.map((session) => session.id)).toEqual(["recent"]);
    expect(grouped.older.map((session) => session.id)).toEqual(["older"]);
    expect(grouped.archived.map((session) => session.id)).toEqual(["archived"]);
  });
});
