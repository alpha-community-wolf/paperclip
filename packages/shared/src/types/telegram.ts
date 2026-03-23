export interface AgentTelegramConfig {
  id: string;
  companyId: string;
  agentId: string;
  botUsername: string | null;
  enabled: boolean;
  allowedUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentTelegramTestResult {
  ok: boolean;
  botId: number;
  botUsername: string;
  firstName: string;
}
