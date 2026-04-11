/**
 * File Index Service
 *
 * In-memory, per-company index of all markdown files across agent workspaces.
 * Powers [[wikilink]] resolution without database storage.
 *
 * Design: built lazily on first request, cached per company with a 5-minute TTL.
 * Invalidation: triggered by file writes via the workspace-files routes.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { normalizeAgentUrlKey } from "@paperclipai/shared";

export interface FileEntry {
  agentId: string;
  agentName: string;
  agentUrlKey: string;
  /** Path relative to the agent cwd, e.g. "workspace/docs/foo.md" */
  relativePath: string;
  modified: Date;
}

export type ResolveResult =
  | {
      resolved: true;
      agentId: string;
      agentName: string;
      agentUrlKey: string;
      relativePath: string;
    }
  | {
      resolved: false;
      candidates: Array<{
        agentId: string;
        agentName: string;
        agentUrlKey: string;
        relativePath: string;
      }>;
    };

/** Filename (without extension, lowercased) → matching file entries across agents */
type FileIndexMap = Map<string, FileEntry[]>;

interface CompanyIndex {
  builtAt: Date;
  index: FileIndexMap;
  /** Track which agents are included so we can partially invalidate */
  agentIds: Set<string>;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);

class FileIndexService {
  private cache = new Map<string, CompanyIndex>();

  /** Invalidate the entire index for a company */
  invalidateCompany(companyId: string): void {
    this.cache.delete(companyId);
  }

  /** Invalidate only one agent's files within a company's index */
  invalidateAgent(companyId: string, agentId: string): void {
    const entry = this.cache.get(companyId);
    if (!entry) return;
    // If the agent is tracked in this index, rebuild on next access
    if (entry.agentIds.has(agentId)) {
      this.cache.delete(companyId);
    }
  }

  async getIndex(db: Db, companyId: string): Promise<FileIndexMap> {
    const cached = this.cache.get(companyId);
    if (cached && Date.now() - cached.builtAt.getTime() < TTL_MS) {
      return cached.index;
    }
    return this.buildIndex(db, companyId);
  }

  async resolve(
    db: Db,
    companyId: string,
    name: string,
    scopeAgentKey?: string,
  ): Promise<ResolveResult> {
    const index = await this.getIndex(db, companyId);
    const lookupName = normalizeWikilinkName(name);
    const entries = index.get(lookupName) ?? [];

    let candidates = entries;
    if (scopeAgentKey) {
      const scoped = entries.filter((e) => e.agentUrlKey === scopeAgentKey);
      // Fall back to all if scoped match is empty
      candidates = scoped.length > 0 ? scoped : entries;
    }

    if (candidates.length === 0) {
      return { resolved: false, candidates: [] };
    }
    if (candidates.length === 1) {
      const { agentId, agentName, agentUrlKey, relativePath } = candidates[0]!;
      return { resolved: true, agentId, agentName, agentUrlKey, relativePath };
    }
    // Ambiguous: return all candidates; caller chooses (UI shows first, tooltip lists others)
    return {
      resolved: false,
      candidates: candidates.map(({ agentId, agentName, agentUrlKey, relativePath }) => ({
        agentId,
        agentName,
        agentUrlKey,
        relativePath,
      })),
    };
  }

  async resolveBatch(
    db: Db,
    companyId: string,
    names: string[],
  ): Promise<Record<string, ResolveResult>> {
    const index = await this.getIndex(db, companyId);
    const result: Record<string, ResolveResult> = {};
    for (const name of names) {
      const lookupName = normalizeWikilinkName(name);
      const entries = index.get(lookupName) ?? [];
      if (entries.length === 0) {
        result[name] = { resolved: false, candidates: [] };
      } else if (entries.length === 1) {
        const { agentId, agentName, agentUrlKey, relativePath } = entries[0]!;
        result[name] = { resolved: true, agentId, agentName, agentUrlKey, relativePath };
      } else {
        result[name] = {
          resolved: false,
          candidates: entries.map(({ agentId, agentName, agentUrlKey, relativePath }) => ({
            agentId,
            agentName,
            agentUrlKey,
            relativePath,
          })),
        };
      }
    }
    return result;
  }

  private async buildIndex(db: Db, companyId: string): Promise<FileIndexMap> {
    const agents = await db.query.agents.findMany({
      where: (a, { eq }) => eq(a.companyId, companyId),
    });

    const index: FileIndexMap = new Map();
    const agentIds = new Set<string>();

    await Promise.all(
      agents.map(async (agent) => {
        const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd;
        if (typeof cwd !== "string" || !cwd) return;

        agentIds.add(agent.id);
        const agentUrlKey = normalizeAgentUrlKey(agent.name) ?? agent.id;
        const entries = await scanAgentDirectory(
          cwd,
          agent.id,
          agent.name,
          agentUrlKey,
        );

        for (const [filename, fileEntries] of entries) {
          const existing = index.get(filename) ?? [];
          index.set(filename, [...existing, ...fileEntries]);
        }
      }),
    );

    const built: CompanyIndex = { builtAt: new Date(), index, agentIds };
    this.cache.set(companyId, built);
    return index;
  }
}

/** Normalize a wikilink name for lookup: lowercase, strip extension, trim */
function normalizeWikilinkName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const ext = path.extname(trimmed);
  if (MARKDOWN_EXTENSIONS.has(ext)) {
    return trimmed.slice(0, -ext.length);
  }
  return trimmed;
}

async function scanAgentDirectory(
  cwd: string,
  agentId: string,
  agentName: string,
  agentUrlKey: string,
): Promise<Map<string, FileEntry[]>> {
  const result: Map<string, FileEntry[]> = new Map();

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist or isn't accessible
    }

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden dirs (.git, .claude, node_modules)
          if (entry.name.startsWith(".") || entry.name === "node_modules") return;
          await walk(fullPath);
          return;
        }

        if (!entry.isFile()) return;
        const ext = path.extname(entry.name).toLowerCase();
        if (!MARKDOWN_EXTENSIONS.has(ext)) return;

        const filenameNoExt = path.basename(entry.name, ext).toLowerCase();
        const relativePath = path.relative(cwd, fullPath);

        let modified = new Date(0);
        try {
          const stat = await fs.stat(fullPath);
          modified = stat.mtime;
        } catch {
          // ok
        }

        const fileEntry: FileEntry = {
          agentId,
          agentName,
          agentUrlKey,
          relativePath,
          modified,
        };
        const existing = result.get(filenameNoExt) ?? [];
        existing.push(fileEntry);
        result.set(filenameNoExt, existing);
      }),
    );
  }

  await walk(cwd);
  return result;
}

export const fileIndexService = new FileIndexService();
