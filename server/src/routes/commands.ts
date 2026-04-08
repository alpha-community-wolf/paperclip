import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createCommandSchema, updateCommandSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { commandService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { conflict, notFound } from "../errors.js";

export function commandRoutes(db: Db) {
  const router = Router();
  const svc = commandService(db);

  router.get("/companies/:companyId/commands", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const rows = await svc.list(companyId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/companies/:companyId/commands",
    validate(createCommandSchema),
    async (req, res, next) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);
        const body = req.body as typeof createCommandSchema._type;

        const existing = await svc.getByTrigger(companyId, body.trigger);
        if (existing) {
          throw conflict(`Command /${body.trigger} already exists`);
        }

        const row = await svc.create(companyId, body);
        const actor = getActorInfo(req);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "command.created",
          entityType: "command",
          entityId: row.id,
          details: { trigger: row.trigger, label: row.label },
        });

        res.status(201).json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  router.put(
    "/companies/:companyId/commands/:id",
    validate(updateCommandSchema),
    async (req, res, next) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);
        const id = req.params.id as string;
        const body = req.body as typeof updateCommandSchema._type;

        const existing = await svc.getById(id);
        if (!existing || existing.companyId !== companyId) {
          throw notFound("Command not found");
        }

        if (body.trigger && body.trigger !== existing.trigger) {
          const duplicate = await svc.getByTrigger(companyId, body.trigger);
          if (duplicate && duplicate.id !== id) {
            throw conflict(`Command /${body.trigger} already exists`);
          }
        }

        const row = await svc.update(id, body);
        if (!row) throw notFound("Command not found");

        const actor = getActorInfo(req);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "command.updated",
          entityType: "command",
          entityId: row.id,
          details: { changedFields: Object.keys(body) },
        });

        res.json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete("/companies/:companyId/commands/:id", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const id = req.params.id as string;

      const existing = await svc.getById(id);
      if (!existing || existing.companyId !== companyId) {
        throw notFound("Command not found");
      }

      await svc.remove(id);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "command.deleted",
        entityType: "command",
        entityId: existing.id,
        details: { trigger: existing.trigger, label: existing.label },
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
