import { Router } from "express";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";
import { fileIndexService } from "../services/file-index.js";

export function fileIndexRoutes(db: Db) {
  const router = Router();

  /**
   * GET /companies/:companyId/file-index
   * Returns the full filename → file-entries map for all agents in the company.
   */
  router.get("/:companyId/file-index", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { index } = await fileIndexService.getIndex(db, companyId);

    const result: Record<string, Array<{
      agentId: string;
      agentName: string;
      agentUrlKey: string;
      relativePath: string;
      modified: string;
    }>> = {};
    for (const [filename, entries] of index) {
      result[filename] = entries.map((e) => ({
        agentId: e.agentId,
        agentName: e.agentName,
        agentUrlKey: e.agentUrlKey,
        relativePath: e.relativePath,
        modified: e.modified.toISOString(),
      }));
    }

    res.json(result);
  });

  /**
   * GET /companies/:companyId/file-index/resolve?name=foo[&scope=agentUrlKey]
   * Resolve a single wikilink name to a file.
   */
  router.get("/:companyId/file-index/resolve", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const name = req.query.name as string | undefined;
    if (!name || !name.trim()) {
      throw badRequest("Query parameter 'name' is required");
    }

    const scope = req.query.scope as string | undefined;
    const result = await fileIndexService.resolve(db, companyId, name, scope);
    res.json(result);
  });

  /**
   * POST /companies/:companyId/file-index/resolve-batch
   * Resolve multiple wikilink names in one request.
   * Body: { names: string[] }
   */
  router.post("/:companyId/file-index/resolve-batch", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { names } = req.body as { names?: unknown };
    if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
      throw badRequest("Body must be { names: string[] }");
    }

    const result = await fileIndexService.resolveBatch(db, companyId, names as string[]);
    res.json(result);
  });

  /**
   * GET /companies/:companyId/file-index/backlinks?filename=foo
   * Get all files that link to the given file via [[wikilinks]].
   * Use the filename without extension (e.g. "MEMORY" for "MEMORY.md").
   */
  router.get("/:companyId/file-index/backlinks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const filename = req.query.filename as string | undefined;
    if (!filename || !filename.trim()) {
      throw badRequest("Query parameter 'filename' is required");
    }

    // Also accept full relative paths — strip extension if given
    const nameOnly = path.basename(filename, path.extname(filename));

    const backlinks = await fileIndexService.getBacklinks(db, companyId, nameOnly);
    res.json(backlinks);
  });

  /**
   * POST /companies/:companyId/file-index/invalidate
   * Force-invalidate the index for a company (useful after bulk file operations).
   */
  router.post("/:companyId/file-index/invalidate", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    fileIndexService.invalidateCompany(companyId);
    res.json({ ok: true });
  });

  return router;
}
