import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createWorkflowTemplateSchema,
  updateWorkflowTemplateSchema,
  runWorkflowTemplateSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { workflowTemplateService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { notFound } from "../errors.js";

export function workflowTemplateRoutes(db: Db) {
  const router = Router();
  const svc = workflowTemplateService(db);

  // List templates for a company
  router.get("/companies/:companyId/workflow-templates", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const includeInactive = req.query.includeInactive === "true";
      const rows = await svc.list(companyId, includeInactive);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // Get template by ID
  router.get("/workflow-templates/:id", async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const row = await svc.getById(id);
      if (!row) throw notFound("Workflow template not found");
      assertCompanyAccess(req, row.companyId);
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  // Create template
  router.post(
    "/companies/:companyId/workflow-templates",
    validate(createWorkflowTemplateSchema),
    async (req, res, next) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);
        const body = req.body as typeof createWorkflowTemplateSchema._type;
        const actor = getActorInfo(req);

        const row = await svc.create(companyId, body, {
          agentId: actor.agentId,
          userId: req.actor.type === "board" ? req.actor.userId ?? null : null,
        });

        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "workflow_template.created",
          entityType: "workflow_template",
          entityId: row.id,
          details: { name: row.name, stepCount: (row.steps as unknown[]).length },
        });

        res.status(201).json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  // Update template
  router.patch(
    "/workflow-templates/:id",
    validate(updateWorkflowTemplateSchema),
    async (req, res, next) => {
      try {
        const id = req.params.id as string;
        const existing = await svc.getById(id);
        if (!existing) throw notFound("Workflow template not found");
        assertCompanyAccess(req, existing.companyId);
        const body = req.body as typeof updateWorkflowTemplateSchema._type;

        const row = await svc.update(id, body);
        if (!row) throw notFound("Workflow template not found");

        const actor = getActorInfo(req);
        await logActivity(db, {
          companyId: existing.companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "workflow_template.updated",
          entityType: "workflow_template",
          entityId: row.id,
          details: { changedFields: Object.keys(body), version: row.version },
        });

        res.json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  // Archive (soft delete) template
  router.delete("/workflow-templates/:id", async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const existing = await svc.getById(id);
      if (!existing) throw notFound("Workflow template not found");
      assertCompanyAccess(req, existing.companyId);

      await svc.archive(id);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "workflow_template.archived",
        entityType: "workflow_template",
        entityId: existing.id,
        details: { name: existing.name },
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Run (instantiate) a workflow template
  router.post(
    "/workflow-templates/:id/run",
    validate(runWorkflowTemplateSchema),
    async (req, res, next) => {
      try {
        const id = req.params.id as string;
        const existing = await svc.getById(id);
        if (!existing) throw notFound("Workflow template not found");
        assertCompanyAccess(req, existing.companyId);
        const body = req.body as typeof runWorkflowTemplateSchema._type;
        const actor = getActorInfo(req);

        const result = await svc.run(id, body, {
          agentId: actor.agentId,
          userId: req.actor.type === "board" ? req.actor.userId ?? null : null,
        });

        await logActivity(db, {
          companyId: existing.companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "workflow_template.run",
          entityType: "workflow_template",
          entityId: existing.id,
          details: {
            rootIssueId: result.rootIssueId,
            stepCount: result.stepIssues.length,
          },
        });

        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
