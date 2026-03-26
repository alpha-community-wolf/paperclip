export interface SidebarBadges {
  inbox: number;
  approvals: number;
  failedRuns: number;
  joinRequests: number;
  unreadTouchedIssues: number;
  alerts: number;
  unreadChatSessions: number;
  /** Unread chat session count keyed by agentId. Only agents with unread > 0 are included. */
  unreadChatByAgent: Record<string, number>;
}
