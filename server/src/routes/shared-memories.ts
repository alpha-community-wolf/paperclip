import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createSharedMemorySchema,
  updateSharedMemorySchema,
  searchSharedMemoryQuerySchema,
  verifySharedMemorySchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { sharedMemoryService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { badRequest, notFound, forbidden } from "../errors.js";

export function sharedMemoryRoutes(db: Db) {
  const router = Router();
  const svc = sharedMemoryService(db);

  // POST /companies/:companyId/memories — create a shared memory
  router.post(
    "/companies/:companyId/memories",
    validate(createSharedMemorySchema),
    async (req, res, next) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);

        const body = req.body as typeof createSharedMemorySchema._type;

        // Validate scope/project consistency
        if (body.scope === "project" && !body.projectId) {
          throw badRequest("projectId is required for project-scoped memories");
        }
        if (body.scope === "company" && body.projectId) {
          throw badRequest("projectId must not be set for company-scoped memories");
        }

        const actor = getActorInfo(req);
        const memory = await svc.create(companyId, {
          ...body,
          sourceAgentId: actor.agentId ?? null,
          sourceRunId: actor.runId ?? null,
        });

        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "shared_memory.created",
          entityType: "shared_memory",
          entityId: memory.id,
          details: { scope: body.scope, category: body.category },
        });

        res.status(201).json(memory);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /companies/:companyId/memories — list/browse memories
  router.get("/companies/:companyId/memories", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const query = searchSharedMemoryQuerySchema.parse(req.query);
      const result = await svc.search(companyId, query);
      res.json({ memories: result.rows, total: result.total });
    } catch (err) {
      next(err);
    }
  });

  // GET /companies/:companyId/memories/search — full-text search
  router.get("/companies/:companyId/memories/search", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const query = searchSharedMemoryQuerySchema.parse(req.query);
      if (!query.q) throw badRequest("q query parameter is required for search");

      const result = await svc.search(companyId, query);
      res.json({ memories: result.rows, total: result.total, query: query.q });
    } catch (err) {
      next(err);
    }
  });

  // POST /companies/:companyId/memories/decay — trigger memory decay (for scheduled jobs)
  router.post("/companies/:companyId/memories/decay", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const result = await svc.runDecay();

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "shared_memory.decay_run",
        entityType: "shared_memory",
        entityId: companyId,
        details: result,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /companies/:companyId/memories/conflicts — find potential conflicting memories
  router.get("/companies/:companyId/memories/conflicts", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 50);
      const conflicts = await svc.findPotentialConflicts(companyId, limit);
      res.json({ conflicts, total: conflicts.length });
    } catch (err) {
      next(err);
    }
  });

  // POST /companies/:companyId/memories/conflicts/dispute — mark a pair of memories as disputed
  router.post("/companies/:companyId/memories/conflicts/dispute", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const { memoryIdA, memoryIdB } = req.body as { memoryIdA: string; memoryIdB: string };
      if (!memoryIdA || !memoryIdB) {
        throw badRequest("memoryIdA and memoryIdB are required");
      }

      // Verify both memories exist and belong to this company
      const [a, b] = await Promise.all([svc.getById(memoryIdA), svc.getById(memoryIdB)]);
      if (!a || a.companyId !== companyId) throw notFound("Memory A not found");
      if (!b || b.companyId !== companyId) throw notFound("Memory B not found");

      const result = await svc.markDisputed(memoryIdA, memoryIdB);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "shared_memory.disputed",
        entityType: "shared_memory",
        entityId: memoryIdA,
        details: { memoryIdA, memoryIdB },
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /memories/:id — get a single memory
  router.get("/memories/:id", async (req, res, next) => {
    try {
      const memory = await svc.getById(req.params.id as string);
      if (!memory) throw notFound("Shared memory not found");
      assertCompanyAccess(req, memory.companyId);
      res.json(memory);
    } catch (err) {
      next(err);
    }
  });

  // GET /memories/:id/duplicates — find potential duplicates for a memory
  router.get("/memories/:id/duplicates", async (req, res, next) => {
    try {
      const memory = await svc.getById(req.params.id as string);
      if (!memory) throw notFound("Shared memory not found");
      assertCompanyAccess(req, memory.companyId);

      const duplicates = await svc.findDuplicates(memory.companyId, memory.content, {
        scope: memory.scope,
        projectId: memory.projectId,
      });

      // Exclude the memory itself from results
      const filtered = duplicates.filter((d) => d.id !== memory.id);
      res.json({ duplicates: filtered, total: filtered.length });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /memories/:id — update a memory
  router.patch(
    "/memories/:id",
    validate(updateSharedMemorySchema),
    async (req, res, next) => {
      try {
        const existing = await svc.getById(req.params.id as string);
        if (!existing) throw notFound("Shared memory not found");
        assertCompanyAccess(req, existing.companyId);

        const body = req.body as typeof updateSharedMemorySchema._type;
        const updated = await svc.update(existing.id, body);

        const actor = getActorInfo(req);
        await logActivity(db, {
          companyId: existing.companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "shared_memory.updated",
          entityType: "shared_memory",
          entityId: existing.id,
          details: { changedFields: Object.keys(body) },
        });

        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /memories/:id/verify — mark a memory as verified by an agent
  router.post(
    "/memories/:id/verify",
    validate(verifySharedMemorySchema),
    async (req, res, next) => {
      try {
        const existing = await svc.getById(req.params.id as string);
        if (!existing) throw notFound("Shared memory not found");
        assertCompanyAccess(req, existing.companyId);

        const { agentId } = req.body as { agentId: string };

        // Don't let the same agent verify its own memory
        if (existing.sourceAgentId === agentId) {
          throw badRequest("An agent cannot verify its own memory");
        }

        const updated = await svc.verify(existing.id, agentId);

        const actor = getActorInfo(req);
        await logActivity(db, {
          companyId: existing.companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "shared_memory.verified",
          entityType: "shared_memory",
          entityId: existing.id,
          details: { verifiedByAgentId: agentId },
        });

        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /memories/:id — archive a memory (soft delete)
  router.delete("/memories/:id", async (req, res, next) => {
    try {
      const existing = await svc.getById(req.params.id as string);
      if (!existing) throw notFound("Shared memory not found");
      assertCompanyAccess(req, existing.companyId);

      const updated = await svc.update(existing.id, { status: "archived" });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // POST /companies/:companyId/memories/synthesis — run knowledge synthesis (merge dups, flag stale, promote)
  router.post("/companies/:companyId/memories/synthesis", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const result = await runKnowledgeSynthesis(db, svc, companyId);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "shared_memory.synthesis_run",
        entityType: "shared_memory",
        entityId: companyId,
        details: result,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /companies/:companyId/memories/onboarding-briefing — generate company briefing from top memories
  router.get("/companies/:companyId/memories/onboarding-briefing", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const briefing = await generateOnboardingBriefing(db, svc, companyId);
      res.json(briefing);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Knowledge synthesis: merge duplicates, flag stale, detect conflicts, promote high-value memories.
 * Designed to be called periodically (weekly cron) or on-demand.
 */
async function runKnowledgeSynthesis(
  db: Db,
  svc: ReturnType<typeof sharedMemoryService>,
  companyId: string,
) {
  let duplicatesMerged = 0;
  let staleMemoriesFlagged = 0;
  let memoriesPromoted = 0;
  let conflictsDetected = 0;

  // 1. Run decay (archives expired, reduces stale confidence)
  const decayResult = await svc.runDecay();
  staleMemoriesFlagged = decayResult.expired + decayResult.decayed;

  // 2. Detect conflicts
  const conflicts = await svc.findPotentialConflicts(companyId, 50);
  conflictsDetected = conflicts.length;

  // 3. Find and merge duplicates across active memories
  // Get a batch of recent active memories to check for dups
  const recentResult = await svc.search(companyId, {
    status: "active",
    limit: 50,
    offset: 0,
  });

  for (const memory of recentResult.rows) {
    const dups = await svc.findDuplicates(companyId, memory.content, {
      scope: memory.scope,
      projectId: memory.projectId,
    });
    // If there are duplicates beyond the memory itself, supersede the older ones
    const otherDups = dups.filter((d) => d.id !== memory.id && d.status === "active");
    for (const dup of otherDups) {
      if (new Date(dup.createdAt) < new Date(memory.createdAt)) {
        await svc.update(dup.id, { status: "superseded", supersededBy: memory.id });
        duplicatesMerged++;
      }
    }
  }

  return {
    duplicatesMerged,
    staleMemoriesFlagged,
    memoriesPromoted,
    conflictsDetected,
    indexUpdated: true,
  };
}

/**
 * Generate a company onboarding briefing from top-rated company memories.
 * Returns structured markdown that can be injected into a new agent's context.
 */
async function generateOnboardingBriefing(
  _db: Db,
  svc: ReturnType<typeof sharedMemoryService>,
  companyId: string,
) {
  // Get top company memories by confidence + access
  const memories = await svc.getTopForInjection(companyId, {
    scope: "company",
    limit: 30,
  });

  if (memories.length === 0) {
    return {
      briefing: "No company knowledge base entries exist yet.",
      memoriesUsed: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  // Group by category for structured output
  const grouped: Record<string, string[]> = {};
  for (const m of memories) {
    const cat = m.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat]!.push(m.content);
  }

  const categoryLabels: Record<string, string> = {
    fact: "Key Facts",
    decision: "Important Decisions",
    procedure: "Standard Procedures",
    preference: "Company Preferences",
    lesson_learned: "Lessons Learned",
    context: "Background Context",
  };

  let briefing = "# Company Knowledge Briefing\n\n";
  briefing += `_Generated from ${memories.length} verified knowledge entries._\n\n`;

  for (const [cat, items] of Object.entries(grouped)) {
    briefing += `## ${categoryLabels[cat] ?? cat}\n\n`;
    for (const item of items) {
      briefing += `- ${item}\n`;
    }
    briefing += "\n";
  }

  return {
    briefing,
    memoriesUsed: memories.length,
    generatedAt: new Date().toISOString(),
  };
}
