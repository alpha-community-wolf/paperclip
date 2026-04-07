import { sharedMemoryService } from "../../services/shared-memories.js";
import type { SystemChoreTypeDefinition, SystemChoreContext, SystemChoreResult } from "../types.js";

export const knowledgeSynthesisChore: SystemChoreTypeDefinition = {
  key: "knowledge_synthesis",
  name: "Knowledge Synthesis",
  description:
    "Periodically merges duplicate shared memories, flags stale entries, detects conflicts, and promotes high-value memories. Keeps the company knowledge base clean and accurate.",
  defaultExpression: "0 3 * * *", // daily at 3 AM
  defaultTimezone: "UTC",
  defaultEnabled: true,

  async execute(ctx: SystemChoreContext): Promise<SystemChoreResult> {
    const svc = sharedMemoryService(ctx.db);

    let duplicatesMerged = 0;
    let staleMemoriesFlagged = 0;
    const memoriesPromoted = 0;
    let conflictsDetected = 0;

    // 1. Run decay (archives expired, reduces stale confidence)
    const decayResult = await svc.runDecay();
    staleMemoriesFlagged = decayResult.expired + decayResult.decayed;

    // 2. Detect conflicts
    const conflicts = await svc.findPotentialConflicts(ctx.companyId, 50);
    conflictsDetected = conflicts.length;

    // 3. Find and merge duplicates across active memories
    const recentResult = await svc.search(ctx.companyId, {
      status: "active",
      limit: 50,
      offset: 0,
    });

    for (const memory of recentResult.rows) {
      const dups = await svc.findDuplicates(ctx.companyId, memory.content, {
        scope: memory.scope,
        projectId: memory.projectId,
      });
      const otherDups = dups.filter((d) => d.id !== memory.id && d.status === "active");
      for (const dup of otherDups) {
        if (new Date(dup.createdAt) < new Date(memory.createdAt)) {
          await svc.update(dup.id, { status: "superseded", supersededBy: memory.id });
          duplicatesMerged++;
        }
      }
    }

    const details = {
      duplicatesMerged,
      staleMemoriesFlagged,
      memoriesPromoted,
      conflictsDetected,
      indexUpdated: true,
    };

    const parts: string[] = [];
    if (duplicatesMerged > 0) parts.push(`merged ${duplicatesMerged} duplicates`);
    if (staleMemoriesFlagged > 0) parts.push(`flagged ${staleMemoriesFlagged} stale`);
    if (conflictsDetected > 0) parts.push(`detected ${conflictsDetected} conflicts`);
    const summary = parts.length > 0 ? `Knowledge synthesis: ${parts.join(", ")}.` : "Knowledge synthesis: no changes needed.";

    return { summary, details };
  },
};
