import type { SystemChoreTypeDefinition } from "./types.js";
import { knowledgeSynthesisChore } from "./types/knowledge-synthesis.js";

const choreTypes = new Map<string, SystemChoreTypeDefinition>();

function register(def: SystemChoreTypeDefinition) {
  if (choreTypes.has(def.key)) {
    throw new Error(`Duplicate system chore key: ${def.key}`);
  }
  choreTypes.set(def.key, def);
}

// Register all built-in chore types
register(knowledgeSynthesisChore);

/** Get a chore type definition by key. */
export function getSystemChoreType(key: string): SystemChoreTypeDefinition | undefined {
  return choreTypes.get(key);
}

/** Get all registered chore type definitions. */
export function getAllSystemChoreTypes(): SystemChoreTypeDefinition[] {
  return Array.from(choreTypes.values());
}
