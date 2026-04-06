import { and, eq, sql, inArray, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { sharedMemories } from "@paperclipai/db";
import type { CreateSharedMemory, UpdateSharedMemory, SearchSharedMemoryQuery } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";

export function sharedMemoryService(db: Db) {
  /**
   * Find existing active memories with similar content (full-text match).
   * Returns up to 5 candidates in the same company + scope.
   */
  async function findDuplicates(
    companyId: string,
    content: string,
    opts?: { scope?: string; projectId?: string | null },
  ) {
    // Build a tsquery from the content words (top 10 words for perf)
    const words = content
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter((w) => w.length > 2)
      .slice(0, 10);

    if (words.length < 2) return [];

    const tsQuery = words.join(" & ");
    const conditions: SQL[] = [
      eq(sharedMemories.companyId, companyId),
      eq(sharedMemories.status, "active"),
      sql`"content_search" @@ to_tsquery('english', ${tsQuery})`,
    ];
    if (opts?.scope) conditions.push(eq(sharedMemories.scope, opts.scope));
    if (opts?.projectId) conditions.push(eq(sharedMemories.projectId, opts.projectId));

    return db
      .select()
      .from(sharedMemories)
      .where(and(...conditions))
      .orderBy(
        sql`ts_rank("content_search", to_tsquery('english', ${tsQuery})) DESC`,
      )
      .limit(5);
  }

  /**
   * Create a shared memory with duplicate detection.
   * If a near-duplicate exists, supersedes it and boosts confidence.
   */
  async function create(
    companyId: string,
    data: CreateSharedMemory & { sourceAgentId?: string | null; sourceRunId?: string | null },
  ) {
    // Check for duplicates before inserting
    const duplicates = await findDuplicates(companyId, data.content, {
      scope: data.scope,
      projectId: data.projectId,
    });

    // If a high-similarity duplicate exists from the same scope, supersede the older one
    let supersededId: string | null = null;
    let boostedConfidence = data.confidence ?? 0.8;

    if (duplicates.length > 0) {
      const best = duplicates[0]!;
      // Normalize content for comparison
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      const existingNorm = normalize(best.content);
      const newNorm = normalize(data.content);

      // Check if content is substantially the same (one contains the other, or >80% word overlap)
      const existingWords = new Set(existingNorm.split(" "));
      const newWords = newNorm.split(" ");
      const overlap = newWords.filter((w) => existingWords.has(w)).length;
      const overlapRatio = overlap / Math.max(existingWords.size, newWords.length);

      if (overlapRatio > 0.8) {
        // Supersede the old memory, boost confidence
        supersededId = best.id;
        boostedConfidence = Math.min(1.0, Math.max(boostedConfidence, best.confidence + 0.05));

        await db
          .update(sharedMemories)
          .set({
            status: "superseded",
            supersededBy: sql`gen_random_uuid()`, // placeholder — will be updated after insert
            updatedAt: new Date(),
          })
          .where(eq(sharedMemories.id, best.id));
      }
    }

    const row = await db
      .insert(sharedMemories)
      .values({
        companyId,
        scope: data.scope,
        projectId: data.projectId ?? null,
        content: data.content,
        category: data.category,
        tags: data.tags ?? [],
        confidence: boostedConfidence,
        sourceAgentId: data.sourceAgentId ?? null,
        sourceIssueId: data.sourceIssueId ?? null,
        sourceRunId: data.sourceRunId ?? null,
        sourceType: data.sourceType ?? "agent_save",
      })
      .returning()
      .then((rows) => rows[0]!);

    // Link superseded memory to the new one
    if (supersededId) {
      await db
        .update(sharedMemories)
        .set({ supersededBy: row.id })
        .where(eq(sharedMemories.id, supersededId))
        .catch(() => {}); // best-effort
    }

    // Auto-promotion: check if 2+ agents independently saved the same fact
    void checkAutoPromotion(companyId, row).catch(() => {});

    return row;
  }

  /**
   * Auto-promotion rules:
   * 1. If 2+ agents independently save the same fact in project scope → promote to company.
   * 2. If a project memory is accessed by agents on 3+ projects → promote to company.
   * Rule 2 is checked during getTopForInjection; rule 1 is checked here on create.
   */
  async function checkAutoPromotion(
    companyId: string,
    newMemory: typeof sharedMemories.$inferSelect,
  ) {
    if (newMemory.scope !== "project") return;

    // Count distinct agents who saved similar content across ALL project-scoped memories
    const words = newMemory.content
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter((w) => w.length > 2)
      .slice(0, 10);

    if (words.length < 2) return;
    const tsQuery = words.join(" & ");

    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT source_agent_id)::int AS distinct_agents
      FROM shared_memories
      WHERE company_id = ${companyId}
        AND status = 'active'
        AND source_agent_id IS NOT NULL
        AND "content_search" @@ to_tsquery('english', ${tsQuery})
    `) as unknown as Array<{ distinct_agents: number }>;

    const distinctAgents = result[0]?.distinct_agents ?? 0;
    if (distinctAgents >= 2) {
      // Promote: create a company-scoped version
      const existing = await db
        .select()
        .from(sharedMemories)
        .where(
          and(
            eq(sharedMemories.companyId, companyId),
            eq(sharedMemories.scope, "company"),
            eq(sharedMemories.status, "active"),
            sql`"content_search" @@ to_tsquery('english', ${tsQuery})`,
          ),
        )
        .limit(1);

      // Only promote if no company-scoped version already exists
      if (existing.length === 0) {
        await db
          .insert(sharedMemories)
          .values({
            companyId,
            scope: "company",
            projectId: null,
            content: newMemory.content,
            category: newMemory.category,
            tags: newMemory.tags,
            confidence: Math.min(1.0, newMemory.confidence + 0.1),
            sourceAgentId: newMemory.sourceAgentId,
            sourceIssueId: newMemory.sourceIssueId,
            sourceRunId: newMemory.sourceRunId,
            sourceType: "propagated",
          });

        logger.info(
          { companyId, content: newMemory.content.slice(0, 80), distinctAgents },
          "shared-memory: auto-promoted project memory to company scope",
        );
      }
    }
  }

  async function getById(id: string) {
    return db
      .select()
      .from(sharedMemories)
      .where(eq(sharedMemories.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function update(id: string, data: UpdateSharedMemory) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.content !== undefined) patch.content = data.content;
    if (data.category !== undefined) patch.category = data.category;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.confidence !== undefined) patch.confidence = data.confidence;
    if (data.status !== undefined) patch.status = data.status;
    if (data.supersededBy !== undefined) patch.supersededBy = data.supersededBy;
    if (data.expiresAt !== undefined) patch.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

    return db
      .update(sharedMemories)
      .set(patch)
      .where(eq(sharedMemories.id, id))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  /**
   * Verify a memory — boosts confidence when a different agent confirms accuracy.
   */
  async function verify(id: string, agentId: string) {
    const memory = await getById(id);
    if (!memory) return null;

    // Boost confidence by 0.15 on verification, capped at 1.0
    const newConfidence = Math.min(1.0, memory.confidence + 0.15);

    return db
      .update(sharedMemories)
      .set({
        verifiedByAgentId: agentId,
        verifiedAt: new Date(),
        confidence: newConfidence,
        updatedAt: new Date(),
      })
      .where(eq(sharedMemories.id, id))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function search(companyId: string, query: SearchSharedMemoryQuery) {
    const conditions: SQL[] = [eq(sharedMemories.companyId, companyId)];

    if (query.status) conditions.push(eq(sharedMemories.status, query.status));
    if (query.scope) conditions.push(eq(sharedMemories.scope, query.scope));
    if (query.projectId) conditions.push(eq(sharedMemories.projectId, query.projectId));
    if (query.category) conditions.push(eq(sharedMemories.category, query.category));
    if (query.tags) {
      const tagList = query.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        conditions.push(sql`${sharedMemories.tags} && ${tagList}`);
      }
    }

    // Full-text search when q is provided
    if (query.q) {
      const tsQuery = query.q
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w: string) => w.replace(/[^a-zA-Z0-9]/g, ""))
        .filter(Boolean)
        .join(" & ");
      if (tsQuery) {
        conditions.push(
          sql`"content_search" @@ to_tsquery('english', ${tsQuery})`,
        );
      }
    }

    const where = and(...conditions);

    // Order by relevance when searching, otherwise by recency
    const orderClause = query.q
      ? sql`ts_rank("content_search", to_tsquery('english', ${query.q.trim().split(/\s+/).filter(Boolean).map((w: string) => w.replace(/[^a-zA-Z0-9]/g, "")).filter(Boolean).join(" & ")})) DESC, ${sharedMemories.updatedAt} DESC`
      : sql`${sharedMemories.updatedAt} DESC`;

    const rows = await db
      .select()
      .from(sharedMemories)
      .where(where)
      .orderBy(orderClause)
      .limit(query.limit ?? 20)
      .offset(query.offset ?? 0);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sharedMemories)
      .where(where)
      .then((r) => r[0]?.count ?? 0);

    return { rows, total: countResult };
  }

  /**
   * Fetch top-K memories for context injection at wake time.
   * Ranked by: confidence * 0.4 + recency * 0.3 + access * 0.2 + verification * 0.1
   */
  async function getTopForInjection(
    companyId: string,
    opts: { scope: "company" | "project"; projectId?: string; limit: number },
  ) {
    const conditions: SQL[] = [
      eq(sharedMemories.companyId, companyId),
      eq(sharedMemories.scope, opts.scope),
      eq(sharedMemories.status, "active"),
      sql`${sharedMemories.confidence} >= 0.3`,
    ];
    if (opts.scope === "project" && opts.projectId) {
      conditions.push(eq(sharedMemories.projectId, opts.projectId));
    }

    const rows = await db
      .select()
      .from(sharedMemories)
      .where(and(...conditions))
      .orderBy(
        sql`(
          ${sharedMemories.confidence} * 0.4
          + (1.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - ${sharedMemories.updatedAt})) / 2592000.0)) * 0.3
          + LEAST(1.0, ${sharedMemories.accessCount}::real / 20.0) * 0.2
          + CASE WHEN ${sharedMemories.verifiedAt} IS NOT NULL THEN 0.1 ELSE 0.0 END
        ) DESC`,
      )
      .limit(opts.limit);

    // Bump access counts in background (fire and forget)
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      db.update(sharedMemories)
        .set({
          accessCount: sql`${sharedMemories.accessCount} + 1`,
          lastAccessedAt: new Date(),
        })
        .where(inArray(sharedMemories.id, ids))
        .execute()
        .catch(() => {}); // best-effort
    }

    return rows;
  }

  /**
   * Memory decay job — run periodically (e.g. daily).
   * 1. Archive memories past their expires_at date.
   * 2. Reduce confidence by 0.1 for memories with 0 access in 90+ days.
   * 3. Memories below 0.3 confidence are already excluded from injection by getTopForInjection.
   * Returns counts of affected memories.
   */
  async function runDecay() {
    const now = new Date();

    // 1. Archive expired memories
    const expiredResult = await db
      .update(sharedMemories)
      .set({ status: "archived", updatedAt: now })
      .where(
        and(
          eq(sharedMemories.status, "active"),
          sql`${sharedMemories.expiresAt} IS NOT NULL AND ${sharedMemories.expiresAt} < ${now}`,
        ),
      )
      .returning({ id: sharedMemories.id });

    // 2. Decay confidence on stale memories (no access in 90+ days)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const decayedResult = await db
      .update(sharedMemories)
      .set({
        confidence: sql`GREATEST(0.0, ${sharedMemories.confidence} - 0.1)`,
        updatedAt: now,
      })
      .where(
        and(
          eq(sharedMemories.status, "active"),
          sql`${sharedMemories.confidence} > 0.0`,
          sql`(${sharedMemories.lastAccessedAt} IS NULL OR ${sharedMemories.lastAccessedAt} < ${ninetyDaysAgo})`,
          sql`${sharedMemories.createdAt} < ${ninetyDaysAgo}`,
        ),
      )
      .returning({ id: sharedMemories.id });

    return {
      expired: expiredResult.length,
      decayed: decayedResult.length,
    };
  }

  /**
   * Detect conflicting memories — find active memories with overlapping
   * full-text content but from different agents. Returns pairs that may contradict.
   * Intended for periodic review, not real-time enforcement.
   */
  async function findPotentialConflicts(companyId: string, limit = 20) {
    // Find pairs of active memories from different agents with high text similarity
    type ConflictRow = {
      id_a: string;
      id_b: string;
      content_a: string;
      content_b: string;
      agent_a: string | null;
      agent_b: string | null;
      category: string;
    };

    const result = await db.execute(sql`
      SELECT
        a.id AS id_a, b.id AS id_b,
        a.content AS content_a, b.content AS content_b,
        a.source_agent_id AS agent_a, b.source_agent_id AS agent_b,
        a.category AS category
      FROM shared_memories a
      JOIN shared_memories b ON a.company_id = b.company_id
        AND a.id < b.id
        AND a.category = b.category
        AND a.status = 'active' AND b.status = 'active'
        AND a.source_agent_id IS DISTINCT FROM b.source_agent_id
        AND a."content_search" @@ plainto_tsquery('english', b.content)
      WHERE a.company_id = ${companyId}
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `) as unknown as ConflictRow[];

    return result;
  }

  /**
   * Mark two memories as disputed and return their IDs.
   */
  async function markDisputed(idA: string, idB: string) {
    const now = new Date();
    await db
      .update(sharedMemories)
      .set({ status: "disputed", updatedAt: now })
      .where(inArray(sharedMemories.id, [idA, idB]));
    return { idA, idB };
  }

  return {
    create,
    getById,
    update,
    verify,
    search,
    getTopForInjection,
    findDuplicates,
    runDecay,
    findPotentialConflicts,
    markDisputed,
  };
}
