export interface AgentTelegramConfig {
  id: string;
  companyId: string;
  agentId: string;
  botUsername: string | null;
  enabled: boolean;
  ownerChatId: string | null;
  allowedUserIds: string[];
  requireMention: boolean;
  mentionPatterns: string[];
  miniAppEnabled: boolean;
  miniAppUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTelegramTestResult {
  ok: boolean;
  botId: number;
  botUsername: string;
  firstName: string;
}

export type TelegramMediaType = "photo" | "document";

export interface MiniAppAuthRequest {
  initData: string;
  botId: string;
}

export interface MiniAppAuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    telegramUserId: string;
  };
  companyId: string;
}

export interface SendTelegramNotificationOptions {
  sessionId?: string;
  mediaType?: TelegramMediaType;
  mediaUrl?: string;
  mediaPath?: string;
  caption?: string;
}
