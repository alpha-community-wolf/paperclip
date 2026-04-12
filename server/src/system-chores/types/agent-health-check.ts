import { agents } from "@paperclipai/db";
import { and, eq, isNotNull, lte, or, isNull } from "drizzle-orm";
import type { SystemChoreTypeDefinition, SystemChoreContext, SystemChoreResult } from "../types.js";

export const agentHealthCheckChore: SystemChoreTypeDefinition = {
  key: "agent_health_check",
  name: "Agent Health Check",
  description:
    "Checks each agent's last heartbeat and flags agents that haven't run recently. Helps surface stuck or disconnected agents.",
  defaultExpression: "*/30 * * * *", // every 30 minutes
  defaultTimezone: "UTC",
  defaultEnabled: true,

  async execute(ctx: SystemChoreContext): Promise<SystemChoreResult> {
    const thresholdHours = (ctx.config.thresholdHours as number) ?? 4;

    const cutoff = new Date();
    cutoff.setTime(cutoff.getTime() - thresholdHours * 60 * 60 * 1000);

    // Find agents that have a heartbeat configured but haven't run recently
    const unhealthyAgents = await ctx.db
      .select({
        id: agents.id,
        name: agents.name,
        lastHeartbeatAt: agents.lastHeartbeatAt,
      })
      .from(agents)
      .where(
        and(
          eq(agents.companyId, ctx.companyId),
          eq(agents.status, "active"),
          or(
            isNull(agents.lastHeartbeatAt),
            lte(agents.lastHeartbeatAt, cutoff),
          ),
        ),
      )
      .limit(100);

    const flagged = unhealthyAgents.map((a) => ({
      id: a.id,
      name: a.name,
      lastHeartbeatAt: a.lastHeartbeatAt?.toISOString() ?? null,
    }));

    const details = { flagged, thresholdHours, total: flagged.length };
    const summary =
      flagged.length > 0
        ? `Agent health check: ${flagged.length} agent${flagged.length !== 1 ? "s" : ""} inactive for >${thresholdHours}h.`
        : `Agent health check: all agents healthy.`;

    return { summary, details };
  },
};
