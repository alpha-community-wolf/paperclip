import type { SystemChoreTypeDefinition } from "./types.js";
import { knowledgeSynthesisChore } from "./types/knowledge-synthesis.js";
import { staleIssueDetectorChore } from "./types/stale-issue-detector.js";
import { agentHealthCheckChore } from "./types/agent-health-check.js";
import { runCleanupChore } from "./types/run-cleanup.js";
import { orphanIssueCleanupChore } from "./types/orphan-issue-cleanup.js";
import { dailyDigestChore } from "./types/daily-digest.js";

const choreTypes = new Map<string, SystemChoreTypeDefinition>();

function register(def: SystemChoreTypeDefinition) {
  if (choreTypes.has(def.key)) {
    throw new Error(`Duplicate system chore key: ${def.key}`);
  }
  choreTypes.set(def.key, def);
}

// Register all built-in chore types
register(knowledgeSynthesisChore);
register(staleIssueDetectorChore);
register(agentHealthCheckChore);
register(runCleanupChore);
register(orphanIssueCleanupChore);
register(dailyDigestChore);

/** Get a chore type definition by key. */
export function getSystemChoreType(key: string): SystemChoreTypeDefinition | undefined {
  return choreTypes.get(key);
}

/** Get all registered chore type definitions. */
export function getAllSystemChoreTypes(): SystemChoreTypeDefinition[] {
  return Array.from(choreTypes.values());
}
