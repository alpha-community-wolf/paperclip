import { Router, type Request } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { isUuidLike } from "@paperclipai/shared";
import { badRequest, forbidden, notFound, unprocessable } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";

const MAX_RESULTS = 20;
const DEFAULT_LIMIT = 5;
const MAX_RESPONSE_CHARS = 16000;
const CONTEXT_LINES = 2; // lines of context around each match

// Simple per-agent rate limiter: max 30 requests per 60 seconds
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rateBuckets = new Map<string, number[]>();

function checkRate(agentId: string): boolean {
  const now = Date.now();
  const timestamps = rateBuckets.get(agentId) ?? [];
  const valid = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (valid.length >= RATE_MAX) return false;
  valid.push(now);
  rateBuckets.set(agentId, valid);
  return true;
}

// Periodically clean up stale buckets (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateBuckets) {
    const valid = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
    if (valid.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, valid);
  }
}, 300_000).unref();

interface SearchResult {
  file: string;
  score: number;
  content: string;
}

async function collectMemoryFiles(cwd: string): Promise<Array<{ relativePath: string; fullPath: string }>> {
  const files: Array<{ relativePath: string; fullPath: string }> = [];

  // 1. MEMORY.md at root
  const memoryMd = path.join(cwd, "MEMORY.md");
  try {
    const stat = await fs.stat(memoryMd);
    if (stat.isFile()) files.push({ relativePath: "MEMORY.md", fullPath: memoryMd });
  } catch { /* skip */ }

  // 2. memory/*.md (daily notes)
  const memoryDir = path.join(cwd, "memory");
  try {
    const entries = await fs.readdir(memoryDir);
    for (const entry of entries.filter((e) => e.endsWith(".md")).sort().reverse()) {
      files.push({ relativePath: `memory/${entry}`, fullPath: path.join(memoryDir, entry) });
    }
  } catch { /* skip */ }

  // 3. life/**/*.md and life/**/*.yaml (PARA entities)
  const lifeDir = path.join(cwd, "life");
  try {
    await scanDir(lifeDir, "life", files);
  } catch { /* skip */ }

  return files;
}

async function scanDir(
  dir: string,
  prefix: string,
  out: Array<{ relativePath: string; fullPath: string }>,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = `${prefix}/${entry.name}`;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(full, rel, out);
    } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
      out.push({ relativePath: rel, fullPath: full });
    }
  }
}

function searchFile(content: string, relativePath: string, query: string): SearchResult | null {
  const lowerQuery = query.toLowerCase();
  const lowerContent = content.toLowerCase();
  const lowerPath = relativePath.toLowerCase();

  // Check if query matches at all
  const pathMatch = lowerPath.includes(lowerQuery);
  const contentMatch = lowerContent.includes(lowerQuery);

  if (!pathMatch && !contentMatch) return null;

  // Score: filename/title match gets +10, content match gets +1 per occurrence (max 5)
  let score = 0;
  if (pathMatch) score += 10;

  if (contentMatch) {
    let count = 0;
    let idx = 0;
    while ((idx = lowerContent.indexOf(lowerQuery, idx)) !== -1 && count < 5) {
      count++;
      idx += lowerQuery.length;
    }
    score += count;
  }

  // Extract context around first match
  const lines = content.split("\n");
  let contextSnippet = "";

  if (contentMatch) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        const start = Math.max(0, i - CONTEXT_LINES);
        const end = Math.min(lines.length, i + CONTEXT_LINES + 1);
        contextSnippet = lines.slice(start, end).join("\n");
        break;
      }
    }
  } else {
    // Path match only — return first few lines as context
    contextSnippet = lines.slice(0, 5).join("\n");
  }

  return { file: relativePath, score, content: contextSnippet };
}

interface AgentLike {
  id: string;
  companyId: string;
  adapterConfig: Record<string, unknown> | null;
}

interface AgentServiceLike {
  getById(id: string): Promise<AgentLike | null>;
  resolveByReference(companyId: string, ref: string): Promise<{ agent: AgentLike | null; ambiguous?: boolean }>;
}

export function memorySearchRoutes(svcOrDb: AgentServiceLike | unknown) {
  const router = Router();

  // Accept either a pre-built service object (for tests) or a Db instance
  let resolvedSvc: AgentServiceLike | null = null;

  function getSvc(): AgentServiceLike {
    if (resolvedSvc) return resolvedSvc;
    if (typeof (svcOrDb as AgentServiceLike)?.getById === "function") {
      resolvedSvc = svcOrDb as AgentServiceLike;
    } else {
      // Lazy dynamic import for production use with Db instance
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { agentService } = require("../services/index.js");
      resolvedSvc = agentService(svcOrDb);
    }
    return resolvedSvc!;
  }

  async function resolveAgent(req: Request): Promise<AgentLike> {
    const rawId = (req.params.id ?? "").trim();
    if (!rawId) throw badRequest("Agent ID is required");

    const svc = getSvc();

    if (isUuidLike(rawId)) {
      const agent = await svc.getById(rawId);
      if (!agent) throw notFound("Agent not found");
      return agent;
    }

    const companyId =
      typeof req.query.companyId === "string" && req.query.companyId.trim().length > 0
        ? req.query.companyId.trim()
        : req.actor?.type === "agent"
          ? req.actor.companyId
          : null;

    if (!companyId) throw unprocessable("Agent shortname lookup requires companyId query parameter");

    const resolved = await svc.resolveByReference(companyId, rawId);
    if (!resolved.agent) throw notFound("Agent not found");
    return resolved.agent;
  }

  router.get("/agents/:id/memory/search", async (req, res, next) => {
    try {
      const agent = await resolveAgent(req);
      assertCompanyAccess(req, agent.companyId);

      // Rate limit
      if (!checkRate(agent.id)) {
        res.status(429).json({ error: "Too many memory search requests. Try again shortly." });
        return;
      }

      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!q) throw badRequest("q query parameter is required");
      if (q.length > 200) throw badRequest("Query too long (max 200 characters)");

      const limit = Math.min(
        Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT),
        MAX_RESULTS,
      );

      const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd;
      if (!cwd || typeof cwd !== "string") {
        throw badRequest("Agent has no workspace directory configured");
      }

      const files = await collectMemoryFiles(cwd);
      const results: SearchResult[] = [];

      for (const file of files) {
        try {
          const stat = await fs.stat(file.fullPath);
          if (stat.size > 512 * 1024) continue; // skip files > 512KB
          const content = await fs.readFile(file.fullPath, "utf-8");
          const result = searchFile(content, file.relativePath, q);
          if (result) results.push(result);
        } catch {
          continue;
        }
      }

      // Sort by score descending, then by path (MEMORY.md first)
      results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.file === "MEMORY.md") return -1;
        if (b.file === "MEMORY.md") return 1;
        return a.file.localeCompare(b.file);
      });

      // Apply limit
      const limited = results.slice(0, limit);

      // Cap total response chars
      let totalChars = 0;
      const capped: SearchResult[] = [];
      for (const r of limited) {
        totalChars += r.file.length + r.content.length;
        if (totalChars > MAX_RESPONSE_CHARS && capped.length > 0) break;
        capped.push(r);
      }

      res.json({
        query: q,
        results: capped,
        totalMatches: results.length,
        truncated: results.length > capped.length,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
