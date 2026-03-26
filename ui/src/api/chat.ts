import type {
  ChatMessage,
  ChatSession,
  CreateChatMessageResponse,
  CreateChatSessionResponse,
} from "@paperclipai/shared";
import { api } from "./client";

function sessionsBasePath(agentId: string) {
  return `/agents/${encodeURIComponent(agentId)}/chat/sessions`;
}

function messagesBasePath(agentId: string, sessionId: string) {
  return `${sessionsBasePath(agentId)}/${encodeURIComponent(sessionId)}/messages`;
}

export interface ChatLogEvent {
  ts: string;
  stream: "stdout" | "stderr" | "system";
  chunk: string;
}

export const chatApi = {
  listCompanySessions: (companyId: string, options?: { limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    const suffix = params.toString();
    return api.get<ChatSession[]>(
      `/companies/${encodeURIComponent(companyId)}/chat/sessions${suffix ? `?${suffix}` : ""}`,
    );
  },
  listSessions: (agentId: string, options?: { includeArchived?: boolean }) => {
    const includeArchived = options?.includeArchived ?? false;
    const params = new URLSearchParams();
    if (includeArchived) params.set("includeArchived", "true");
    const suffix = params.toString();
    return api.get<ChatSession[]>(`${sessionsBasePath(agentId)}${suffix ? `?${suffix}` : ""}`);
  },
  createSession: (agentId: string, body?: { title?: string }) =>
    api.post<CreateChatSessionResponse>(sessionsBasePath(agentId), body ?? {}),
  updateSession: (agentId: string, sessionId: string, body: { title?: string | null; archived?: boolean }) =>
    api.patch<{ session: ChatSession }>(
      `${sessionsBasePath(agentId)}/${encodeURIComponent(sessionId)}`,
      body,
    ),
  listMessages: (agentId: string, sessionId: string) =>
    api.get<ChatMessage[]>(messagesBasePath(agentId, sessionId)),
  sendMessage: (agentId: string, sessionId: string, body: { content: string }) =>
    api.post<CreateChatMessageResponse>(messagesBasePath(agentId, sessionId), body),
  retryMessage: (agentId: string, sessionId: string, messageId: string) =>
    api.post<CreateChatMessageResponse>(
      `${messagesBasePath(agentId, sessionId)}/${encodeURIComponent(messageId)}/retry`,
      {},
    ),
  markSessionAsRead: (agentId: string, sessionId: string) =>
    api.post<{ ok: boolean; lastReadAt: string }>(
      `${sessionsBasePath(agentId)}/${encodeURIComponent(sessionId)}/read`,
      {},
    ),
  listUnreadSessionIds: (agentId: string) =>
    api.get<{ sessionIds: string[] }>(
      `/agents/${encodeURIComponent(agentId)}/chat/unread-sessions`,
    ),
  streamUrl: (agentId: string, sessionId: string, messageId: string) =>
    `/api${messagesBasePath(agentId, sessionId)}/${encodeURIComponent(messageId)}/stream`,
};
