import { api } from "./client";

export interface TimelineEvent {
  type: "heartbeat" | "scheduled_issue";
  scheduledAt: string;
  agentId: string;
  agentName: string;
  intervalSec?: number;
  scheduleId?: string;
  scheduleName?: string;
  issueMode?: string;
  cronExpression?: string;
  timezone?: string;
  issueId?: string | null;
}

export interface TimelineResponse {
  events: TimelineEvent[];
}

export const timelineApi = {
  list: (companyId: string, from: string, to: string, agentId?: string) => {
    const params = new URLSearchParams({ from, to });
    if (agentId) params.set("agentId", agentId);
    return api.get<TimelineResponse>(
      `/companies/${companyId}/timeline?${params.toString()}`,
    );
  },
};
