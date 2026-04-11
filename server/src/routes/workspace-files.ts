import { Router, type Request } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import type { Db } from "@paperclipai/db";
import { isUuidLike } from "@paperclipai/shared";
import { agentService } from "../services/index.js";
import { badRequest, forbidden, notFound, unprocessable, conflict } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import { fileIndexService } from "../services/file-index.js";

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB (text content API)
const MAX_RAW_FILE_SIZE = 50 * 1024 * 1024; // 50 MB (raw binary streaming)
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

const TEXT_EXTENSIONS = new Set([
  ".md", ".mdx", ".markdown",
  ".txt", ".log", ".csv",
  ".json", ".jsonl",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cpp", ".h",
  ".sh", ".bash", ".zsh", ".fish",
  ".yaml", ".yml", ".toml", ".ini", ".cfg",
  ".html", ".htm", ".css", ".scss", ".less", ".svg",
  ".xml", ".env", ".gitignore", ".dockerignore",
  ".sql", ".graphql", ".gql",
  ".lock", ".editorconfig",
]);

function isTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (ext === "") return true; // extensionless files (Makefile, Dockerfile, etc.)
  return TEXT_EXTENSIONS.has(ext);
}

const BINARY_MIME_MAP: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".wma": "audio/x-ms-wma",
  // Documents
  ".pdf": "application/pdf",
  // Text / code
  ".json": "application/json",
  ".jsonl": "application/json",
  ".md": "text/markdown",
  ".mdx": "text/markdown",
  ".markdown": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".ts": "text/plain",
  ".tsx": "text/plain",
};

function mimeForExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return BINARY_MIME_MAP[ext] ?? "text/plain";
}

function fullMimeForExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return BINARY_MIME_MAP[ext] ?? "application/octet-stream";
}

function sanitizePath(workspaceRoot: string, requestedPath: string): string {
  const rootWithSep = workspaceRoot.endsWith(path.sep) ? workspaceRoot : workspaceRoot + path.sep;

  // If the request is already an absolute path within the workspace, use it directly
  const trimmed = requestedPath.trim();
  if (path.isAbsolute(trimmed)) {
    const normalizedAbs = path.normalize(trimmed);
    if (normalizedAbs === workspaceRoot || normalizedAbs.startsWith(rootWithSep)) {
      return normalizedAbs;
    }
  }

  const normalized = path.normalize(trimmed).replace(/^\/+/, "");
  const resolved = path.resolve(workspaceRoot, normalized);
  if (resolved !== workspaceRoot && !resolved.startsWith(rootWithSep)) {
    throw forbidden("Path escapes workspace root");
  }
  return resolved;
}

export function workspaceFileRoutes(db: Db) {
  const router = Router();
  const svc = agentService(db);

  async function resolveAgent(req: Request) {
    const rawParam = req.params.id;
    const rawId = typeof rawParam === "string" ? rawParam.trim() : "";
    if (!rawId) throw badRequest("Agent ID is required");

    if (isUuidLike(rawId)) {
      const agent = await svc.getById(rawId);
      if (!agent) throw notFound("Agent not found");
      return agent;
    }

    const companyIdQuery = req.query.companyId;
    const companyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : req.actor?.type === "agent"
          ? req.actor.companyId
          : null;

    if (!companyId) {
      throw unprocessable("Agent shortname lookup requires companyId query parameter");
    }

    const resolved = await svc.resolveByReference(companyId, rawId);
    if (resolved.ambiguous) {
      throw conflict("Agent shortname is ambiguous in this company. Use the agent ID.");
    }
    if (!resolved.agent) throw notFound("Agent not found");
    return resolved.agent;
  }

  router.get("/agents/:id/files", async (req, res, next) => {
    try {
      const agent = await resolveAgent(req);
      assertCompanyAccess(req, agent.companyId);

      const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd;
      if (!cwd || typeof cwd !== "string") {
        throw badRequest("Agent has no workspace directory configured");
      }

      const requestedPath = typeof req.query.path === "string" ? req.query.path : "";
      const resolved = sanitizePath(cwd, requestedPath);

      let stat;
      try {
        stat = await fs.stat(resolved);
      } catch {
        throw notFound("Path not found");
      }
      if (!stat.isDirectory()) {
        throw badRequest("Path is not a directory");
      }

      const dirEntries = await fs.readdir(resolved, { withFileTypes: true });

      const entries = await Promise.all(
        dirEntries
          .filter((e) => !e.name.startsWith(".") || e.name === ".env")
          .map(async (entry) => {
            const entryPath = path.join(resolved, entry.name);
            let size = 0;
            let modified = "";
            try {
              const s = await fs.stat(entryPath);
              size = s.size;
              modified = s.mtime.toISOString();
            } catch {
              // skip stat errors
            }
            return {
              name: entry.name,
              type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
              size,
              modified,
            };
          }),
      );

      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      res.json({ path: requestedPath || "/", entries });
    } catch (err) {
      next(err);
    }
  });

  router.get("/agents/:id/files/content", async (req, res, next) => {
    try {
      const agent = await resolveAgent(req);
      assertCompanyAccess(req, agent.companyId);

      const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd;
      if (!cwd || typeof cwd !== "string") {
        throw badRequest("Agent has no workspace directory configured");
      }

      const requestedPath = typeof req.query.path === "string" ? req.query.path : "";
      if (!requestedPath) {
        throw badRequest("path query parameter is required");
      }

      const resolved = sanitizePath(cwd, requestedPath);

      let stat;
      try {
        stat = await fs.stat(resolved);
      } catch {
        throw notFound("File not found");
      }
      if (!stat.isFile()) {
        throw badRequest("Path is not a file");
      }
      if (stat.size > MAX_FILE_SIZE) {
        throw badRequest(`File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Maximum is 1 MB.`);
      }

      const filename = path.basename(resolved);
      if (!isTextFile(filename)) {
        res.status(415).json({ error: "Binary or unsupported file type" });
        return;
      }

      const content = await fs.readFile(resolved, "utf-8");
      res.json({
        path: requestedPath,
        content,
        mimeType: mimeForExt(filename),
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // ---- Stream raw file content (supports binary: images, video, audio, PDF) ----
  router.get("/agents/:id/files/raw", async (req, res, next) => {
    try {
      const agent = await resolveAgent(req);
      assertCompanyAccess(req, agent.companyId);

      const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd;
      if (!cwd || typeof cwd !== "string") {
        throw badRequest("Agent has no workspace directory configured");
      }

      const requestedPath = typeof req.query.path === "string" ? req.query.path : "";
      if (!requestedPath) {
        throw badRequest("path query parameter is required");
      }

      const resolved = sanitizePath(cwd, requestedPath);

      let stat;
      try {
        stat = await fs.stat(resolved);
      } catch {
        throw notFound("File not found");
      }
      if (!stat.isFile()) {
        throw badRequest("Path is not a file");
      }
      if (stat.size > MAX_RAW_FILE_SIZE) {
        throw badRequest(`File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`);
      }

      const filename = path.basename(resolved);
      const mime = fullMimeForExt(filename);

      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Length", stat.size);

      // For inline display (not download)
      const isDownload = req.query.download === "1";
      if (isDownload) {
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      } else {
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
      }

      const buffer = await fs.readFile(resolved);
      res.end(buffer);
    } catch (err) {
      next(err);
    }
  });

  // ---- Upload a file (multipart/form-data) ----
  const upload = multer({ limits: { fileSize: MAX_UPLOAD_SIZE } });

  router.post("/agents/:id/files", upload.single("file"), async (req, res, next) => {
    try {
      const agent = await resolveAgent(req);
      assertCompanyAccess(req, agent.companyId);

      const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd;
      if (!cwd || typeof cwd !== "string") {
        throw badRequest("Agent has no workspace directory configured");
      }

      const file = req.file;
      if (!file) throw badRequest("No file provided");

      const targetDir = typeof req.query.path === "string" ? req.query.path : "";
      const resolvedDir = sanitizePath(cwd, targetDir);

      await fs.mkdir(resolvedDir, { recursive: true });

      const destPath = path.join(resolvedDir, file.originalname);
      const destWithSep = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;
      if (!destPath.startsWith(destWithSep) && destPath !== cwd) {
        throw forbidden("Path escapes workspace root");
      }

      await fs.writeFile(destPath, file.buffer);

      // Invalidate file index so wikilinks pick up new file
      fileIndexService.invalidateAgent(agent.companyId, agent.id);

      const stat = await fs.stat(destPath);
      res.status(201).json({
        name: file.originalname,
        type: "file" as const,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // ---- Create / overwrite a text file ----
  router.put("/agents/:id/files/content", async (req, res, next) => {
    try {
      const agent = await resolveAgent(req);
      assertCompanyAccess(req, agent.companyId);

      const cwd = (agent.adapterConfig as Record<string, unknown>)?.cwd;
      if (!cwd || typeof cwd !== "string") {
        throw badRequest("Agent has no workspace directory configured");
      }

      const { path: filePath, content } = req.body as { path?: string; content?: string };
      if (!filePath || typeof filePath !== "string") throw badRequest("path is required");
      if (typeof content !== "string") throw badRequest("content must be a string");
      if (content.length > MAX_FILE_SIZE) {
        throw badRequest(`Content too large. Maximum is 1 MB.`);
      }

      const resolved = sanitizePath(cwd, filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf-8");

      // Invalidate file index so wikilinks pick up new/updated file
      fileIndexService.invalidateAgent(agent.companyId, agent.id);

      const stat = await fs.stat(resolved);
      res.status(201).json({
        path: filePath,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
