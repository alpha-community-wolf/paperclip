import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  resolveIssueReviewBundleSchema,
  submitIssueReviewBundleSchema,
  upsertIssueReviewBundleSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { issueService, logActivity, reviewBundleService } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function reviewBundleRoutes(db: Db) {
  const router = Router();
  const issuesSvc = issueService(db);
  const reviewBundlesSvc = reviewBundleService(db);

  async function requireIssue(req: Request, res: Response, id: string) {
    const normalizedId =
      /^[A-Z]+-\d+$/i.test(id)
        ? (await issuesSvc.getByIdentifier(id))?.id ?? id
        : id;
    const issue = await issuesSvc.getById(normalizedId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return null;
    }
    assertCompanyAccess(req, issue.companyId);
    return issue;
  }

  router.get("/issues/:id/review-bundle", async (req, res) => {
    const id = req.params.id as string;
    const issue = await requireIssue(req, res, id);
    if (!issue) return;
    const bundle = await reviewBundlesSvc.getByIssueId(issue.id);
    res.json(bundle);
  });

  router.patch("/issues/:id/review-bundle", validate(upsertIssueReviewBundleSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await requireIssue(req, res, id);
    if (!issue) return;

    const actor = getActorInfo(req);
    const bundle = await reviewBundlesSvc.upsertDraft(
      issue.id,
      {
        agentId: actor.agentId ?? null,
        userId: actor.actorType === "user" ? actor.actorId : null,
      },
      req.body,
    );

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "review_bundle.saved",
      entityType: "issue",
      entityId: issue.id,
      details: {
        bundleId: bundle.id,
        status: bundle.status,
        identifier: issue.identifier,
      },
    });

    res.json(bundle);
  });

  router.post("/issues/:id/review-bundle/submit", validate(submitIssueReviewBundleSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await requireIssue(req, res, id);
    if (!issue) return;

    const actor = getActorInfo(req);
    const bundle = await reviewBundlesSvc.submit(issue.id, {
      agentId: actor.agentId ?? null,
      userId: actor.actorType === "user" ? actor.actorId : null,
    }, req.body);

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "review_bundle.submitted",
      entityType: "issue",
      entityId: issue.id,
      details: {
        bundleId: bundle.id,
        status: bundle.status,
        identifier: issue.identifier,
      },
    });

    res.json(bundle);
  });

  router.post("/issues/:id/review-bundle/approve", validate(resolveIssueReviewBundleSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await requireIssue(req, res, id);
    if (!issue) return;

    const isDesignatedReviewer =
      req.actor.type === "agent" &&
      !!req.actor.agentId &&
      (issue.reviewerAgentId === req.actor.agentId || issue.approverAgentId === req.actor.agentId);

    if (req.actor.type !== "board" && !isDesignatedReviewer) {
      res.status(403).json({ error: "Only board users or designated reviewer/approver agents can approve review bundles" });
      return;
    }

    const actor = getActorInfo(req);
    const bundle = await reviewBundlesSvc.approve(issue.id, {
      decidedByUserId: req.body.decidedByUserId ?? (actor.actorType === "user" ? actor.actorId : "agent"),
      decidedByAgentId: actor.agentId ?? req.body.decidedByAgentId ?? null,
      decisionNote: req.body.decisionNote,
    });

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "review_bundle.approved",
      entityType: "issue",
      entityId: issue.id,
      details: {
        bundleId: bundle.id,
        status: bundle.status,
        identifier: issue.identifier,
      },
    });

    res.json(bundle);
  });

  router.post(
    "/issues/:id/review-bundle/request-changes",
    validate(resolveIssueReviewBundleSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const issue = await requireIssue(req, res, id);
      if (!issue) return;

      const isDesignatedReviewer =
        req.actor.type === "agent" &&
        !!req.actor.agentId &&
        (issue.reviewerAgentId === req.actor.agentId || issue.approverAgentId === req.actor.agentId);

      if (req.actor.type !== "board" && !isDesignatedReviewer) {
        res.status(403).json({ error: "Only board users or designated reviewer/approver agents can request review changes" });
        return;
      }

      const actor = getActorInfo(req);
      const bundle = await reviewBundlesSvc.requestChanges(issue.id, {
        decidedByUserId: req.body.decidedByUserId ?? (actor.actorType === "user" ? actor.actorId : "agent"),
        decidedByAgentId: actor.agentId ?? req.body.decidedByAgentId ?? null,
        decisionNote: req.body.decisionNote,
      });

      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "review_bundle.changes_requested",
        entityType: "issue",
        entityId: issue.id,
        details: {
          bundleId: bundle.id,
          status: bundle.status,
          identifier: issue.identifier,
        },
      });

      res.json(bundle);
    },
  );

  return router;
}
