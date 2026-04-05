import { and, desc, eq, sql, inArray, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { sharedMemories } from "@paperclipai/db";
import type { CreateSharedMemory, UpdateSharedMemory, SearchSharedMemoryQuery } from "@paperclipai/shared";

export function sharedMemoryService(db: Db) {
  async function create(
    companyId: string,
    data: CreateSharedMemory & { sourceAgentId?: string | null; sourceRunId?: string | null },
  ) {
    const row = await db
      .insert(sharedMemories)
      .values({
        companyId,
        scope: data.scope,
        projectId: data.projectId ?? null,
        content: data.content,
        category: data.category,
        tags: data.tags ?? [],
        confidence: data.confidence ?? 0.8,
        sourceAgentId: data.sourceAgentId ?? null,
        sourceIssueId: data.sourceIssueId ?? null,
        sourceRunId: data.sourceRunId ?? null,
        sourceType: data.sourceType ?? "agent_save",
      })
      .returning()
      .then((rows) => rows[0]!);
    return row;
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

  async function verify(id: string, agentId: string) {
    return db
      .update(sharedMemories)
      .set({
        verifiedByAgentId: agentId,
        verifiedAt: new Date(),
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

  return { create, getById, update, verify, search, getTopForInjection };
}
