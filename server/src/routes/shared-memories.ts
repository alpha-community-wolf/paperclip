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

  return router;
}
