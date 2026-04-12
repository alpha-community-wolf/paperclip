import { normalizeHostnameInput, type PaperclipConfig } from "@paperclipai/shared";
import { readConfigFile, writeConfigFile } from "../config-file.js";

export type MergeHostnameResult =
  | { ok: true; added: boolean; hostname: string }
  | { ok: false; error: string };

/**
 * Append a hostname to `server.allowedHostnames` in the on-disk config (deduped).
 * Used by Telegram Mini App URL save and optional CLI flows.
 */
export function mergeHostnameIntoFileAllowedHostnames(rawHostname: string): MergeHostnameResult {
  let hostname: string;
  try {
    hostname = normalizeHostnameInput(rawHostname);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const existing = readConfigFile();
  if (!existing) {
    return { ok: false, error: "Paperclip config file not found; cannot update allowed hostnames." };
  }

  const current = new Set(
    (existing.server.allowedHostnames ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean),
  );
  const duplicate = current.has(hostname);
  current.add(hostname);

  const next: PaperclipConfig = {
    ...existing,
    server: {
      ...existing.server,
      allowedHostnames: Array.from(current).sort(),
    },
    $meta: {
      ...existing.$meta,
      updatedAt: new Date().toISOString(),
      source: "board_ui",
    },
  };

  try {
    writeConfigFile(next);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to write config file",
    };
  }

  return { ok: true, added: !duplicate, hostname };
}

export function replaceFileAllowedHostnames(hostnames: string[]): void {
  const normalized = Array.from(
    new Set(
      hostnames
        .map((h) => {
          try {
            return normalizeHostnameInput(h);
          } catch {
            return null;
          }
        })
        .filter((h): h is string => h !== null),
    ),
  ).sort();

  const existing = readConfigFile();
  if (!existing) {
    throw new Error("Paperclip config file not found");
  }

  const next: PaperclipConfig = {
    ...existing,
    server: {
      ...existing.server,
      allowedHostnames: normalized,
    },
    $meta: {
      ...existing.$meta,
      updatedAt: new Date().toISOString(),
      source: "board_ui",
    },
  };

  writeConfigFile(next);
}
