import fs from "node:fs";
import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { normalizeHostnameInput, patchInstanceNetworkSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { loadConfig } from "../config.js";
import { readConfigFile } from "../config-file.js";
import { resolvePaperclipConfigPath } from "../paths.js";
import { replaceFileAllowedHostnames } from "../services/instance-network-file.js";

function assertInstanceNetworkAccess(req: Request, res: Response): boolean {
  if (req.actor.type !== "board") {
    res.status(403).json({ error: "Board access required" });
    return false;
  }
  if (req.actor.source !== "local_implicit" && !req.actor.isInstanceAdmin) {
    res.status(403).json({
      error: "Instance admin required to view or change server network settings",
    });
    return false;
  }
  return true;
}

export function instanceNetworkRoutes(_db: Db) {
  const router = Router();

  router.get("/network", (req, res) => {
    if (!assertInstanceNetworkAccess(req, res)) return;

    const runtime = loadConfig();
    const fileConfig = readConfigFile();
    const configPath = resolvePaperclipConfigPath();
    const envRaw = process.env.PAPERCLIP_ALLOWED_HOSTNAMES;
    const envAllowedHostnames = envRaw
      ? envRaw
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0)
      : null;

    const authPublicHostname = runtime.authPublicBaseUrl
      ? (() => {
          try {
            return new URL(runtime.authPublicBaseUrl).hostname.trim().toLowerCase();
          } catch {
            return null;
          }
        })()
      : null;

    const privateHostnameGateEnabled =
      runtime.deploymentMode === "authenticated" && runtime.deploymentExposure === "private";

    res.json({
      configPath,
      configFileExists: fs.existsSync(configPath),
      fileAllowedHostnames: fileConfig?.server.allowedHostnames ?? [],
      envAllowedHostnames,
      authPublicHostname,
      effectiveAllowedHostnames: runtime.allowedHostnames,
      deploymentMode: runtime.deploymentMode,
      deploymentExposure: runtime.deploymentExposure,
      privateHostnameGateEnabled,
      bindHost: runtime.host,
      restartRequiredAfterFileChange: true,
      notes: {
        envOverride:
          envAllowedHostnames && envAllowedHostnames.length > 0
            ? "PAPERCLIP_ALLOWED_HOSTNAMES is set; those hosts are merged at runtime. Restart after changing env."
            : null,
        viteDev:
          "After changing allowed hostnames, restart the Paperclip server so Vite dev middleware picks up the new list.",
      },
    });
  });

  router.patch("/network", validate(patchInstanceNetworkSchema), (req, res) => {
    if (!assertInstanceNetworkAccess(req, res)) return;

    const normalized: string[] = [];
    for (const raw of req.body.allowedHostnames as string[]) {
      try {
        normalized.push(normalizeHostnameInput(raw));
      } catch (err) {
        res.status(400).json({
          error: "Invalid hostname in list",
          detail: err instanceof Error ? err.message : String(err),
          hostname: raw,
        });
        return;
      }
    }

    try {
      replaceFileAllowedHostnames(normalized);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to write config file",
      });
      return;
    }

    res.json({
      ok: true,
      allowedHostnamesWritten: Array.from(new Set(normalized)).sort(),
      restartRequired: true,
    });
  });

  return router;
}
