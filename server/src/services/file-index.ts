/**
 * File Index Service
 *
 * In-memory, per-company index of all markdown files across agent workspaces.
 * Powers [[wikilink]] resolution and backlinks without database storage.
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

export interface BacklinkEntry {
  sourceAgentId: string;
  sourceAgentName: string;
  sourceAgentUrlKey: string;
  sourceRelativePath: string;
  /** The wikilink target as written, e.g. "proof-points" */
  targetName: string;
  /** ~200-char surrounding context snippet */
  contextSnippet: string;
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

/** Filename (without extension, lowercased) → all backlink entries pointing at that file */
type BacklinkMap = Map<string, BacklinkEntry[]>;

interface CompanyIndex {
  builtAt: Date;
  index: FileIndexMap;
  backlinks: BacklinkMap;
  /** Track which agents are included so we can partially invalidate */
  agentIds: Set<string>;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);

/**
 * Matches [[target]], [[target|alias]], [[target#heading]], [[target#heading|alias]]
 * Capture group 1 = target (the filename portion before | or #)
 */
const WIKILINK_RE = /\[\[([^\]|#\n]+)(?:[|#][^\]]*)?]]/g;

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
    if (entry.agentIds.has(agentId)) {
      this.cache.delete(companyId);
    }
  }

  async getIndex(db: Db, companyId: string): Promise<CompanyIndex> {
    const cached = this.cache.get(companyId);
    if (cached && Date.now() - cached.builtAt.getTime() < TTL_MS) {
      return cached;
    }
    return this.buildIndex(db, companyId);
  }

  async resolve(
    db: Db,
    companyId: string,
    name: string,
    scopeAgentKey?: string,
  ): Promise<ResolveResult> {
    const { index } = await this.getIndex(db, companyId);
    const lookupName = normalizeWikilinkName(name);
    const entries = index.get(lookupName) ?? [];

    let candidates = entries;
    if (scopeAgentKey) {
      const scoped = entries.filter((e) => e.agentUrlKey === scopeAgentKey);
      candidates = scoped.length > 0 ? scoped : entries;
    }

    if (candidates.length === 0) {
      return { resolved: false, candidates: [] };
    }
    if (candidates.length === 1) {
      const { agentId, agentName, agentUrlKey, relativePath } = candidates[0]!;
      return { resolved: true, agentId, agentName, agentUrlKey, relativePath };
    }
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
    const { index } = await this.getIndex(db, companyId);
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

  /**
   * Get all files that link to the given file via [[wikilinks]].
   * Identified by filename (without extension) — same key as the forward index.
   */
  async getBacklinks(
    db: Db,
    companyId: string,
    targetFilename: string,
  ): Promise<BacklinkEntry[]> {
    const { backlinks } = await this.getIndex(db, companyId);
    const key = normalizeWikilinkName(targetFilename);
    return backlinks.get(key) ?? [];
  }

  private async buildIndex(db: Db, companyId: string): Promise<CompanyIndex> {
    const agents = await db.query.agents.findMany({
      where: (a, { eq }) => eq(a.companyId, companyId),
    });

    const index: FileIndexMap = new Map();
    const backlinks: BacklinkMap = new Map();
    const agentIds = new Set<string>();

    // Phase 1: scan all agent directories, collect file entries
    const agentScans: Array<{
      agentId: string;
      agentName: string;
      agentUrlKey: string;
      cwd: string;
      files: Map<string, FileEntry[]>;
    }> = [];

    await Promise.all(
      agents.map(async (agent) => {
        const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd;
        if (typeof cwd !== "string" || !cwd) return;

        agentIds.add(agent.id);
        const agentUrlKey = normalizeAgentUrlKey(agent.name) ?? agent.id;
        const files = await scanAgentDirectory(cwd, agent.id, agent.name, agentUrlKey);

        for (const [filename, fileEntries] of files) {
          const existing = index.get(filename) ?? [];
          index.set(filename, [...existing, ...fileEntries]);
        }

        agentScans.push({ agentId: agent.id, agentName: agent.name, agentUrlKey, cwd, files });
      }),
    );

    // Phase 2: parse each markdown file for [[wikilinks]] and build backlinks map
    await Promise.all(
      agentScans.map(async ({ agentId, agentName, agentUrlKey, cwd }) => {
        const allFiles = await collectMarkdownFiles(cwd);
        await Promise.all(
          allFiles.map(async (fullPath) => {
            const sourceRelativePath = path.relative(cwd, fullPath);
            let content: string;
            try {
              content = await fs.readFile(fullPath, "utf-8");
            } catch {
              return;
            }

            const links = extractWikilinks(content);
            for (const { target, contextSnippet } of links) {
              const key = normalizeWikilinkName(target);
              const entry: BacklinkEntry = {
                sourceAgentId: agentId,
                sourceAgentName: agentName,
                sourceAgentUrlKey: agentUrlKey,
                sourceRelativePath,
                targetName: target,
                contextSnippet,
              };
              const existing = backlinks.get(key) ?? [];
              existing.push(entry);
              backlinks.set(key, existing);
            }
          }),
        );
      }),
    );

    const built: CompanyIndex = { builtAt: new Date(), index, backlinks, agentIds };
    this.cache.set(companyId, built);
    return built;
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

/** Extract all [[wikilinks]] from markdown content with context snippets */
function extractWikilinks(content: string): Array<{ target: string; contextSnippet: string }> {
  const results: Array<{ target: string; contextSnippet: string }> = [];

  // Reset regex state
  WIKILINK_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(content)) !== null) {
    const target = match[1]!.trim();
    if (!target) continue;

    // Extract context: find the line(s) surrounding the match, truncated to 200 chars
    const idx = match.index;
    const lineStart = content.lastIndexOf("\n", idx) + 1;
    const lineEnd = content.indexOf("\n", idx + match[0].length);
    const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim();
    const contextSnippet = line.length > 200 ? line.slice(0, 197) + "…" : line;

    results.push({ target, contextSnippet });
  }

  return results;
}

/** Collect all markdown file paths under a directory (recursive) */
async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const result: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") return;
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (MARKDOWN_EXTENSIONS.has(ext)) result.push(fullPath);
        }
      }),
    );
  }

  await walk(dir);
  return result;
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
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
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

        const fileEntry: FileEntry = { agentId, agentName, agentUrlKey, relativePath, modified };
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
