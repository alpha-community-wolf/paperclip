import { useState, useCallback } from "react";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  curl command parser                                                */
/* ------------------------------------------------------------------ */

export interface ParsedApiCall {
  method: string;
  url: string;
  body: string | null;
  headers: Record<string, string>;
}

/** Try to extract HTTP method, URL, headers, and body from a curl command string */
export function parseCurlCommand(command: string): ParsedApiCall | null {
  const trimmed = command.trim();

  // Must start with "curl" (possibly preceded by env vars or other shell tokens)
  if (!/(?:^|\s|&&|\|)curl\s/i.test(` ${trimmed}`)) return null;

  let method = "GET";
  let url: string | null = null;
  let body: string | null = null;
  const headers: Record<string, string> = {};

  // Extract method: -X METHOD or --request METHOD
  const methodMatch = trimmed.match(/(?:-X|--request)\s+["']?(\w+)["']?/);
  if (methodMatch) {
    method = methodMatch[1].toUpperCase();
  }

  // Extract body: -d '...' or --data '...' or --data-raw '...'
  // Handle single-quoted, double-quoted, and unquoted bodies
  const bodyMatch = trimmed.match(
    /(?:-d|--data(?:-raw)?)\s+(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(\S+))/,
  );
  if (bodyMatch) {
    body = bodyMatch[1] ?? bodyMatch[2] ?? bodyMatch[3] ?? null;
    if (!method || method === "GET") method = "POST";
  }

  // Extract headers: -H 'Key: Value'
  const headerRegex = /-H\s+(?:'([^']*)'|"([^"]*)")/g;
  let hMatch;
  while ((hMatch = headerRegex.exec(trimmed)) !== null) {
    const headerStr = hMatch[1] ?? hMatch[2] ?? "";
    const colonIdx = headerStr.indexOf(":");
    if (colonIdx > 0) {
      const key = headerStr.slice(0, colonIdx).trim();
      const val = headerStr.slice(colonIdx + 1).trim();
      headers[key] = val;
    }
  }

  // Extract URL: find the token that looks like a URL
  // Remove all flag+value pairs, then find a URL-like token
  let cleaned = trimmed
    // Remove -X/--request + value
    .replace(/(?:-X|--request)\s+["']?\w+["']?/g, "")
    // Remove -d/--data/--data-raw + value (quoted or unquoted)
    .replace(/(?:-d|--data(?:-raw)?)\s+(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\S+)/g, "")
    // Remove -H + value
    .replace(/-H\s+(?:'[^']*'|"[^"]*")/g, "")
    // Remove standalone flags
    .replace(/\s-[sSkfLvio]\b/g, "")
    .replace(/\s--(?:silent|show-error|fail|location|verbose|include|output|compressed|insecure)\b/g, "")
    // Remove -w + value
    .replace(/-w\s+(?:'[^']*'|"[^"]*"|\S+)/g, "")
    // Remove -o + value
    .replace(/-o\s+\S+/g, "")
    // Remove --connect-timeout/--max-time + value
    .replace(/--(?:connect-timeout|max-time)\s+\S+/g, "");

  // Find URL-like token (starts with http or contains /)
  const urlMatch = cleaned.match(
    /(?:["'])(https?:\/\/[^"'\s]+)(?:["'])|(?:["'])(\/[^"'\s]+)(?:["'])|(https?:\/\/\S+)|((?:\$\{?\w+\}?)?\/\S+)/,
  );
  if (urlMatch) {
    url = urlMatch[1] ?? urlMatch[2] ?? urlMatch[3] ?? urlMatch[4] ?? null;
    // Strip trailing quotes or semicolons
    if (url) url = url.replace(/[;"']+$/, "");
  }

  if (!url) return null;

  return { method, url, body, headers };
}

/* ------------------------------------------------------------------ */
/*  Response parser                                                    */
/* ------------------------------------------------------------------ */

interface ParsedApiResponse {
  statusCode: number | null;
  body: string;
  isJson: boolean;
}

/** Try to extract status code and body from curl output */
export function parseApiResponse(content: string): ParsedApiResponse {
  const trimmed = content.trim();

  // Check if output starts with HTTP status line (when -i flag was used)
  const httpStatusMatch = trimmed.match(/^HTTP\/[\d.]+\s+(\d{3})/);
  let statusCode: number | null = null;
  let body = trimmed;

  if (httpStatusMatch) {
    statusCode = parseInt(httpStatusMatch[1], 10);
    // Strip headers: everything up to the first blank line
    const headerEnd = trimmed.indexOf("\n\n");
    if (headerEnd > 0) {
      body = trimmed.slice(headerEnd + 2).trim();
    }
  }

  // Check for status code appended at end (common with -w '%{http_code}')
  if (!statusCode) {
    const trailingCode = trimmed.match(/\n(\d{3})$/);
    if (trailingCode) {
      statusCode = parseInt(trailingCode[1], 10);
      body = trimmed.slice(0, trimmed.lastIndexOf("\n" + trailingCode[1])).trim();
    }
  }

  // Try to parse as JSON for pretty display
  let isJson = false;
  try {
    JSON.parse(body);
    isJson = true;
  } catch {
    // Not JSON, that's fine
  }

  return { statusCode, body, isJson };
}

/* ------------------------------------------------------------------ */
/*  Helper: shorten URL for display                                    */
/* ------------------------------------------------------------------ */

function shortenUrl(url: string): string {
  // Remove protocol
  let display = url.replace(/^https?:\/\//, "");
  // Collapse env var expansions like ${PAPERCLIP_API_URL}
  display = display.replace(/\$\{?\w+\}?/, "…");
  // Truncate long URLs
  if (display.length > 80) {
    display = display.slice(0, 77) + "…";
  }
  return display;
}

/* ------------------------------------------------------------------ */
/*  Method badge colors                                                */
/* ------------------------------------------------------------------ */

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/40",
  POST: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700/40",
  PUT: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700/40",
  PATCH: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700/40",
  DELETE: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700/40",
};

function getMethodColor(method: string): string {
  return METHOD_COLORS[method] ?? "bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700";
}

/* ------------------------------------------------------------------ */
/*  Status code badge                                                  */
/* ------------------------------------------------------------------ */

function StatusBadge({ code }: { code: number }) {
  const color =
    code >= 200 && code < 300
      ? "bg-green-100 text-green-700 border-green-300/50 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700/30"
      : code >= 400
        ? "bg-red-100 text-red-700 border-red-300/50 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700/30"
        : "bg-yellow-100 text-yellow-700 border-yellow-300/50 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700/30";

  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border shrink-0", color)}>
      {code}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  JSON viewer with syntax highlighting                               */
/* ------------------------------------------------------------------ */

function JsonViewer({ content }: { content: string }) {
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    formatted = content;
  }

  // Simple token coloring
  const lines = formatted.split("\n");
  return (
    <pre className="text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed">
      {lines.map((line, i) => (
        <div key={i}>
          <JsonLine line={line} />
        </div>
      ))}
    </pre>
  );
}

function JsonLine({ line }: { line: string }) {
  // Colorize JSON tokens in a single line
  const parts = line.split(
    /("(?:[^"\\]|\\.)*")\s*(:)?|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
  );

  return (
    <>
      {parts.map((token, i) => {
        if (token === undefined || token === "") return null;
        // Key
        if (/^"/.test(token) && parts[i + 1] === ":") {
          return <span key={i} className="text-purple-600 dark:text-purple-400">{token}</span>;
        }
        if (token === ":") return <span key={i}>{token} </span>;
        // String value
        if (/^"/.test(token)) {
          return <span key={i} className="text-green-700 dark:text-green-400">{token}</span>;
        }
        // Bool/null
        if (/^(true|false|null)$/.test(token)) {
          return <span key={i} className="text-red-600 dark:text-red-400">{token}</span>;
        }
        // Number
        if (/^-?\d/.test(token)) {
          return <span key={i} className="text-orange-600 dark:text-orange-400">{token}</span>;
        }
        return <span key={i}>{token}</span>;
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible section                                                */
/* ------------------------------------------------------------------ */

function CollapsibleSection({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer py-0.5"
      >
        <span className="w-3 text-center">{open ? "▼" : "▶"}</span>
        <span>{label}</span>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main: API Call Card (for accordion input)                          */
/* ------------------------------------------------------------------ */

export function ApiCallCardInput({ parsed }: { parsed: ParsedApiCall }) {
  return (
    <div className="rounded-md border border-neutral-200/60 dark:border-neutral-700/40 overflow-hidden bg-neutral-50 dark:bg-neutral-900/50">
      {/* Header: method + URL */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0", getMethodColor(parsed.method))}>
          {parsed.method}
        </span>
        <code className="text-[11px] font-mono text-neutral-700 dark:text-neutral-300 truncate min-w-0" title={parsed.url}>
          {shortenUrl(parsed.url)}
        </code>
      </div>

      {/* Request body (if present) */}
      {parsed.body && (
        <div className="border-t border-neutral-200/40 dark:border-neutral-700/30 px-3 py-2">
          <CollapsibleSection label="Request body" defaultOpen={false}>
            <div className="bg-neutral-100 dark:bg-neutral-900 rounded p-2 overflow-x-auto max-h-64 overflow-y-auto">
              <JsonViewer content={parsed.body} />
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Headers (if notable, skip auth/content-type noise) */}
      {Object.keys(parsed.headers).length > 0 && (
        <div className="border-t border-neutral-200/40 dark:border-neutral-700/30 px-3 py-2">
          <CollapsibleSection label={`Headers (${Object.keys(parsed.headers).length})`}>
            <div className="bg-neutral-100 dark:bg-neutral-900 rounded p-2 text-[11px] font-mono space-y-0.5">
              {Object.entries(parsed.headers).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-purple-600 dark:text-purple-400 shrink-0">{k}:</span>
                  <span className="text-neutral-600 dark:text-neutral-400 truncate">{v}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main: API Response Card (for accordion result)                     */
/* ------------------------------------------------------------------ */

export function ApiCallCardResult({
  content,
  isError,
}: {
  content: string;
  isError: boolean;
}) {
  const parsed = parseApiResponse(content);

  return (
    <div className={cn(
      "rounded-md border overflow-hidden",
      isError
        ? "border-red-300/50 dark:border-red-700/40 bg-red-50/30 dark:bg-red-950/20"
        : "border-neutral-200/60 dark:border-neutral-700/40 bg-neutral-50 dark:bg-neutral-900/50",
    )}>
      {/* Status line */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        {parsed.statusCode ? (
          <StatusBadge code={parsed.statusCode} />
        ) : (
          <span className={cn(
            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0",
            isError
              ? "bg-red-100 text-red-700 border-red-300/50 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700/30"
              : "bg-green-100 text-green-700 border-green-300/50 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700/30",
          )}>
            {isError ? "error" : "ok"}
          </span>
        )}
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          {parsed.body.length > 0 ? `${parsed.body.length} chars` : "empty response"}
        </span>
      </div>

      {/* Response body */}
      {parsed.body.length > 0 && (
        <div className="border-t border-neutral-200/40 dark:border-neutral-700/30 px-3 py-2">
          <CollapsibleSection label="Response body" defaultOpen={parsed.body.length < 500}>
            <div className="bg-neutral-100 dark:bg-neutral-900 rounded p-2 overflow-x-auto max-h-80 overflow-y-auto">
              {parsed.isJson ? (
                <JsonViewer content={parsed.body} />
              ) : (
                <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-neutral-700 dark:text-neutral-300">
                  {parsed.body}
                </pre>
              )}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compact card for inline display (non-accordion mode)               */
/* ------------------------------------------------------------------ */

export function ApiCallCompactBadge({ parsed }: { parsed: ParsedApiCall }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className={cn("inline-flex items-center px-1 py-0 rounded text-[9px] font-mono font-bold border shrink-0", getMethodColor(parsed.method))}>
        {parsed.method}
      </span>
      <code className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 truncate min-w-0">
        {shortenUrl(parsed.url)}
      </code>
    </span>
  );
}
