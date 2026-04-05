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
