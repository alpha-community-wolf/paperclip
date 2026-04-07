import type { Db } from "@paperclipai/db";

/** Context passed to a system chore's execute function. */
export interface SystemChoreContext {
  companyId: string;
  choreKey: string;
  config: Record<string, unknown>;
  db: Db;
  runId: string;
}

/** Result returned by a system chore's execute function. */
export interface SystemChoreResult {
  /** Short human-readable summary of what happened. */
  summary: string;
  /** Structured details (stored in heartbeat_runs.result_json). */
  details?: Record<string, unknown>;
}

/** Definition of a system chore type, registered in the platform. */
export interface SystemChoreTypeDefinition {
  /** Unique key, e.g. "knowledge_synthesis". */
  key: string;
  /** Human-readable display name. */
  name: string;
  /** What this chore does. */
  description: string;
  /** Default cron expression. */
  defaultExpression: string;
  /** Default timezone. */
  defaultTimezone: string;
  /** Whether enabled by default when seeded for a new company. */
  defaultEnabled: boolean;
  /** Execute the chore. */
  execute: (ctx: SystemChoreContext) => Promise<SystemChoreResult>;
}
