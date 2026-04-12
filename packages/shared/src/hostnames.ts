/**
 * Normalize user input (hostname or URL) to a lowercase hostname for Paperclip config.
 */
export function normalizeHostnameInput(raw: string): string {
  const input = raw.trim();
  if (!input) {
    throw new Error("Hostname is required");
  }

  try {
    const url = input.includes("://") ? new URL(input) : new URL(`http://${input}`);
    const hostname = url.hostname.trim().toLowerCase();
    if (!hostname) throw new Error("Hostname is required");
    return hostname;
  } catch {
    throw new Error(`Invalid hostname: ${raw}`);
  }
}

export function parseHostnameCsv(raw: string): string[] {
  if (!raw.trim()) return [];
  const unique = new Set<string>();
  for (const part of raw.split(",")) {
    const hostname = normalizeHostnameInput(part);
    unique.add(hostname);
  }
  return Array.from(unique);
}

/** Extract hostname from an http(s) URL string, or return null if invalid. */
export function hostnameFromHttpUrl(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.trim().toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}
