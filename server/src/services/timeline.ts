import type { Db } from "@paperclipai/db";
import { agents, cronSchedules } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { CronExpressionParser } from "cron-parser";

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeTimezone(value: string | null | undefined): string {
  const candidate = (value ?? "UTC").trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

export interface TimelineEvent {
  type: "heartbeat" | "scheduled_issue";
  scheduledAt: string;
  agentId: string;
  agentName: string;

  // Heartbeat-specific
  intervalSec?: number;

  // Scheduled issue-specific
  scheduleId?: string;
  scheduleName?: string;
  issueMode?: string;
  cronExpression?: string;
  timezone?: string;
  issueId?: string | null;
}

export function timelineService(db: Db) {
  return {
    /**
     * Return projected timeline events for a company within [from, to].
     * Merges heartbeat projections and cron schedule occurrences.
     */
    async list(
      companyId: string,
      from: Date,
      to: Date,
      opts?: { agentId?: string },
    ): Promise<{ events: TimelineEvent[] }> {
      const events: TimelineEvent[] = [];

      // --- Heartbeat projections ---
      const agentFilter = opts?.agentId
        ? and(eq(agents.companyId, companyId), eq(agents.id, opts.agentId))
        : eq(agents.companyId, companyId);

      const companyAgents = await db
        .select({
          id: agents.id,
          name: agents.name,
          status: agents.status,
          runtimeConfig: agents.runtimeConfig,
          lastHeartbeatAt: agents.lastHeartbeatAt,
        })
        .from(agents)
        .where(agentFilter);

      for (const agent of companyAgents) {
        if (agent.status === "paused" || agent.status === "terminated") continue;

        const rc = parseObject(agent.runtimeConfig);
        const hb = parseObject(rc.heartbeat);
        const enabled = asBoolean(hb.enabled, true);
        const intervalSec = asNumber(hb.intervalSec, 0);

        if (!enabled || intervalSec <= 0) continue;

        const anchor = agent.lastHeartbeatAt ?? new Date();
        const intervalMs = intervalSec * 1000;

        // Project forward from the last heartbeat
        let next = new Date(anchor.getTime() + intervalMs);

        // If the next projected heartbeat is before `from`, fast-forward
        if (next < from) {
          const gap = from.getTime() - next.getTime();
          const skips = Math.ceil(gap / intervalMs);
          next = new Date(next.getTime() + skips * intervalMs);
        }

        // Cap at 200 events per agent to avoid runaway loops
        let count = 0;
        while (next <= to && count < 200) {
          events.push({
            type: "heartbeat",
            scheduledAt: next.toISOString(),
            agentId: agent.id,
            agentName: agent.name,
            intervalSec,
          });
          next = new Date(next.getTime() + intervalMs);
          count++;
        }
      }

      // --- Cron schedule projections ---
      const cronFilter = opts?.agentId
        ? and(
            eq(cronSchedules.companyId, companyId),
            eq(cronSchedules.enabled, true),
            eq(cronSchedules.agentId, opts.agentId),
          )
        : and(eq(cronSchedules.companyId, companyId), eq(cronSchedules.enabled, true));

      const schedules = await db
        .select({
          id: cronSchedules.id,
          agentId: cronSchedules.agentId,
          issueId: cronSchedules.issueId,
          name: cronSchedules.name,
          expression: cronSchedules.expression,
          timezone: cronSchedules.timezone,
          issueMode: cronSchedules.issueMode,
        })
        .from(cronSchedules)
        .where(cronFilter);

      // Build agent name lookup from already-fetched agents
      const agentNameMap = new Map(companyAgents.map((a) => [a.id, a.name]));

      for (const schedule of schedules) {
        try {
          const tz = normalizeTimezone(schedule.timezone);
          const interval = CronExpressionParser.parse(schedule.expression, {
            currentDate: from,
            tz,
          });

          let count = 0;
          while (count < 200) {
            const next = interval.next();
            const nextDate = next.toDate();
            if (nextDate > to) break;

            events.push({
              type: "scheduled_issue",
              scheduledAt: nextDate.toISOString(),
              agentId: schedule.agentId,
              agentName: agentNameMap.get(schedule.agentId) ?? "Unknown",
              scheduleId: schedule.id,
              scheduleName: schedule.name,
              issueMode: schedule.issueMode,
              cronExpression: schedule.expression,
              timezone: tz,
              issueId: schedule.issueId,
            });
            count++;
          }
        } catch {
          // Skip schedules with unparseable expressions
        }
      }

      // Sort all events by scheduledAt
      events.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

      return { events };
    },
  };
}
