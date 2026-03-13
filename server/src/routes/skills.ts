import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { createSkillSchema, installSkillSchema, isUuidLike } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { skillService, agentService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { unprocessable, conflict } from "../errors.js";

export function skillRoutes(db: Db) {
  const router = Router();
  const svc = skillService(db);
  const agentSvc = agentService(db);

  async function resolveAgentId(req: Request, rawId: string): Promise<string> {
    if (isUuidLike(rawId)) return rawId;
    const companyIdQuery = req.query.companyId;
    const companyId =
      (typeof companyIdQuery === "string" && companyIdQuery.trim()) ||
      (req.actor.type === "agent" ? req.actor.companyId : null) ||
      null;
    if (!companyId) throw unprocessable("Agent shortname lookup requires companyId query parameter");
    const resolved = await agentSvc.resolveByReference(companyId, rawId);
    if (resolved.ambiguous) throw conflict("Agent shortname is ambiguous. Use the agent ID.");
    return resolved.agent?.id ?? rawId;
  }

  router.param("agentId", async (req, _res, next, rawId) => {
    try {
      req.params.agentId = await resolveAgentId(req, String(rawId));
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/skills", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  router.get("/skills/:id", async (req, res) => {
    const id = req.params.id as string;
    const skill = await svc.getById(id);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    assertCompanyAccess(req, skill.companyId);
    res.json(skill);
  });

  router.post("/companies/:companyId/skills", validate(createSkillSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body as {
      name: string;
      description?: string | null;
      tier: "company" | "agent";
      agentId?: string | null;
      sourceType?: "bundled" | "git" | "local";
      sourceUrl?: string | null;
      installedPath: string;
      metadata?: Record<string, unknown> | null;
    };

    const existing = await svc.getByName(companyId, body.name);
    if (existing) {
      res.status(409).json({ error: `Skill "${body.name}" already exists for this company` });
      return;
    }

    const skill = await svc.create(companyId, {
      name: body.name,
      description: body.description,
      tier: body.tier,
      agentId: body.agentId,
      sourceType: body.sourceType ?? "local",
      sourceUrl: body.sourceUrl,
      installedPath: body.installedPath,
      metadata: body.metadata,
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "skill.created",
      entityType: "skill",
      entityId: skill.id,
      details: { name: skill.name, tier: skill.tier },
    });

    res.status(201).json(skill);
  });

  router.post("/companies/:companyId/skills/install", validate(installSkillSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const body = req.body as {
      command: string;
      tier?: "company" | "agent";
      agentId?: string | null;
      targetDir?: string | null;
    };

    try {
      const result = await svc.installViaCommand(companyId, body.command, {
        tier: body.tier,
        agentId: body.agentId,
        targetDir: body.targetDir,
      });

      const actor = getActorInfo(req);
      for (const skill of result.installed) {
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: "skill.installed",
          entityType: "skill",
          entityId: skill.id,
          details: { name: skill.name, command: body.command },
        });
      }

      res.status(201).json({
        installed: result.installed,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: `Skill install failed: ${message}` });
    }
  });

  router.delete("/skills/:id", async (req, res) => {
    const id = req.params.id as string;
    const skill = await svc.getById(id);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    assertCompanyAccess(req, skill.companyId);

    if (skill.tier === "built_in") {
      res.status(403).json({ error: "Built-in skills cannot be removed" });
      return;
    }

    await svc.remove(id);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: skill.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "skill.removed",
      entityType: "skill",
      entityId: skill.id,
      details: { name: skill.name, tier: skill.tier },
    });

    res.json({ ok: true });
  });

  router.get("/agents/:agentId/skills", async (req, res) => {
    const agentId = req.params.agentId as string;
    const agentSkills = await svc.listForAgent(agentId);
    if (agentSkills.length > 0) {
      assertCompanyAccess(req, agentSkills[0]!.companyId);
    }
    res.json(agentSkills);
  });

  router.get("/agents/:agentId/skill-assignments", async (req, res) => {
    const agentId = req.params.agentId as string;
    const assignments = await svc.listAssignmentsForAgent(agentId);
    res.json(assignments);
  });

  router.post("/agents/:agentId/skills/:skillId/assign", async (req, res) => {
    const { agentId, skillId } = req.params;
    const skill = await svc.getById(skillId as string);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    assertCompanyAccess(req, skill.companyId);

    const isOptionalBuiltIn = skill.tier === "built_in" && !skill.defaultEnabled;
    if (skill.tier !== "company" && !isOptionalBuiltIn) {
      res.status(400).json({ error: "Only company-tier or optional built-in skills can be assigned to agents" });
      return;
    }

    await svc.assignToAgent(agentId as string, skillId as string, skill.companyId);
    res.json({ ok: true });
  });

  router.delete("/agents/:agentId/skills/:skillId/assign", async (req, res) => {
    const { agentId, skillId } = req.params;
    const skill = await svc.getById(skillId as string);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    assertCompanyAccess(req, skill.companyId);

    await svc.unassignFromAgent(agentId as string, skillId as string);
    res.json({ ok: true });
  });

  return router;
}
