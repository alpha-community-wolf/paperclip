import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createInboxDismissalSchema,
  deleteInboxDismissalSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { inboxDismissalService } from "../services/inbox-dismissals.js";
import { assertCompanyAccess } from "./authz.js";

export function inboxDismissalRoutes(db: Db) {
  const router = Router();
  const svc = inboxDismissalService(db);

  router.get("/companies/:companyId/inbox-dismissals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.json([]);
      return;
    }
    const rows = await svc.listByUser(companyId, req.actor.userId);
    res.json(rows);
  });

  router.post(
    "/companies/:companyId/inbox-dismissals",
    validate(createInboxDismissalSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      if (req.actor.type !== "board" || !req.actor.userId) {
        res.status(403).json({ error: "Only board users can dismiss inbox items." });
        return;
      }
      const row = await svc.dismiss(companyId, req.actor.userId, req.body.itemType, req.body.itemId);
      res.status(201).json(row);
    },
  );

  router.delete(
    "/companies/:companyId/inbox-dismissals",
    validate(deleteInboxDismissalSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      if (req.actor.type !== "board" || !req.actor.userId) {
        res.status(403).json({ error: "Only board users can undismiss inbox items." });
        return;
      }
      const row = await svc.undismiss(companyId, req.actor.userId, req.body.itemType, req.body.itemId);
      res.json({ ok: Boolean(row) });
    },
  );

  return router;
}

