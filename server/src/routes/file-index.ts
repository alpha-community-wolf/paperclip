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
   * GET /companies/:companyId/file-index/graph?[agentId=&minLinks=]
   * Returns D3-ready nodes + edges for the file graph visualization.
   *
   * FileNode: { id, label, type:"file", agentId, agentName, agentUrlKey, relativePath, backlinkCount }
   * FileEdge: { id, source, target, edgeType:"wikilink" }
   *
   * Filters:
   *   agentId  — only include files belonging to this agent
   *   minLinks — only include nodes with at least N total connections (in+out)
   */
  router.get("/:companyId/file-index/graph", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const agentIdFilter = req.query.agentId as string | undefined;
    const minLinksRaw = req.query.minLinks as string | undefined;
    const minLinks = minLinksRaw ? Math.max(0, parseInt(minLinksRaw, 10)) : 0;

    const { index, backlinks } = await fileIndexService.getIndex(db, companyId);

    interface FileNode {
      id: string;
      label: string;
      type: "file";
      agentId: string;
      agentName: string;
      agentUrlKey: string;
      relativePath: string;
      backlinkCount: number;
    }

    interface FileEdge {
      id: string;
      source: string;
      target: string;
      edgeType: "wikilink";
    }

    // Build file nodes from index
    const nodesMap = new Map<string, FileNode>();
    for (const entries of index.values()) {
      for (const entry of entries) {
        if (agentIdFilter && entry.agentId !== agentIdFilter) continue;
        const nodeId = `file:${entry.agentUrlKey}/${entry.relativePath}`;
        if (nodesMap.has(nodeId)) continue;
        nodesMap.set(nodeId, {
          id: nodeId,
          label: path.basename(entry.relativePath, path.extname(entry.relativePath)),
          type: "file",
          agentId: entry.agentId,
          agentName: entry.agentName,
          agentUrlKey: entry.agentUrlKey,
          relativePath: entry.relativePath,
          backlinkCount: 0,
        });
      }
    }

    // Build edges from backlinks + tally backlinkCount per target node
    const rawEdges: FileEdge[] = [];
    const edgeKeySet = new Set<string>();

    for (const [targetFilename, backlinkEntries] of backlinks) {
      const targetFiles = index.get(targetFilename) ?? [];
      for (const bl of backlinkEntries) {
        const sourceId = `file:${bl.sourceAgentUrlKey}/${bl.sourceRelativePath}`;
        if (!nodesMap.has(sourceId)) continue;

        for (const targetFile of targetFiles) {
          const targetId = `file:${targetFile.agentUrlKey}/${targetFile.relativePath}`;
          if (!nodesMap.has(targetId)) continue;
          if (sourceId === targetId) continue;

          const edgeKey = `${sourceId}→${targetId}`;
          if (edgeKeySet.has(edgeKey)) continue;
          edgeKeySet.add(edgeKey);

          rawEdges.push({
            id: `e-${rawEdges.length}`,
            source: sourceId,
            target: targetId,
            edgeType: "wikilink",
          });

          // Increment incoming link count on target
          const targetNode = nodesMap.get(targetId);
          if (targetNode) targetNode.backlinkCount++;
        }
      }
    }

    // Apply minLinks filter — keep only nodes with enough total connections
    let nodes = [...nodesMap.values()];
    let edges = rawEdges;

    if (minLinks > 0) {
      const connCount = new Map<string, number>();
      for (const e of edges) {
        connCount.set(e.source, (connCount.get(e.source) ?? 0) + 1);
        connCount.set(e.target, (connCount.get(e.target) ?? 0) + 1);
      }
      const includedIds = new Set(
        nodes.filter((n) => (connCount.get(n.id) ?? 0) >= minLinks).map((n) => n.id),
      );
      nodes = nodes.filter((n) => includedIds.has(n.id));
      edges = edges.filter((e) => includedIds.has(e.source) && includedIds.has(e.target));
    }

    res.json({ nodes, edges });
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
