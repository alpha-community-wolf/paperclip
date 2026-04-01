import { useState, useMemo } from "react";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/** Extract language hint from file extension for syntax highlighting class */
function langFromPath(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    toml: "toml",
    xml: "xml",
    svg: "xml",
    graphql: "graphql",
    gql: "graphql",
    dockerfile: "dockerfile",
  };
  if (!ext) return null;
  // Check filename for Dockerfile
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile" || name.startsWith("dockerfile."))
    return "dockerfile";
  return map[ext] ?? null;
}

/** Shorten a file path to just the last 3 segments for display */
function shortPath(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 3) return filePath;
  return "…/" + parts.slice(-3).join("/");
}

const FILE_TAB =
  "flex items-center gap-1.5 px-3 py-1 bg-neutral-100 dark:bg-neutral-800/60 border-b border-neutral-200/60 dark:border-neutral-700/40 text-[10px] font-mono text-neutral-600 dark:text-neutral-400";

// ---------------------------------------------------------------------------
// Edit tool — unified diff view
// ---------------------------------------------------------------------------

interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

function parseEditInput(input: unknown): EditInput | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.file_path !== "string") return null;
  if (typeof obj.old_string !== "string") return null;
  if (typeof obj.new_string !== "string") return null;
  return {
    file_path: obj.file_path,
    old_string: obj.old_string,
    new_string: obj.new_string,
    replace_all: obj.replace_all === true,
  };
}

interface DiffLine {
  type: "removed" | "added" | "context";
  text: string;
}

/** Generate diff lines from old_string and new_string */
function computeDiffLines(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const lines: DiffLine[] = [];

  // Simple LCS-based diff for better output
  const lcs = computeLCS(oldLines, newLines);

  let oi = 0;
  let ni = 0;

  for (const match of lcs) {
    // Emit removals before this match
    while (oi < match.oldIndex) {
      lines.push({ type: "removed", text: oldLines[oi] });
      oi++;
    }
    // Emit additions before this match
    while (ni < match.newIndex) {
      lines.push({ type: "added", text: newLines[ni] });
      ni++;
    }
    // Emit context line
    lines.push({ type: "context", text: oldLines[oi] });
    oi++;
    ni++;
  }

  // Remaining removals
  while (oi < oldLines.length) {
    lines.push({ type: "removed", text: oldLines[oi] });
    oi++;
  }
  // Remaining additions
  while (ni < newLines.length) {
    lines.push({ type: "added", text: newLines[ni] });
    ni++;
  }

  return lines;
}

interface LCSMatch {
  oldIndex: number;
  newIndex: number;
}

/** Compute LCS matches between two line arrays */
function computeLCS(oldLines: string[], newLines: string[]): LCSMatch[] {
  const m = oldLines.length;
  const n = newLines.length;

  // For very large inputs, fall back to simple remove-all/add-all
  if (m * n > 100_000) {
    return [];
  }

  // Standard LCS DP
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matches
  const matches: LCSMatch[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      matches.push({ oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  matches.reverse();
  return matches;
}

const DIFF_COLLAPSE_LINES = 20;

export function EditCallRenderer({ input }: { input: unknown }) {
  const parsed = useMemo(() => parseEditInput(input), [input]);
  const [expanded, setExpanded] = useState(false);

  if (!parsed) return null;

  const diffLines = useMemo(
    () => computeDiffLines(parsed.old_string, parsed.new_string),
    [parsed.old_string, parsed.new_string],
  );

  const shouldCollapse =
    diffLines.length > DIFF_COLLAPSE_LINES && !expanded;
  const visible = shouldCollapse
    ? diffLines.slice(0, DIFF_COLLAPSE_LINES)
    : diffLines;

  return (
    <div className="rounded-md border border-neutral-200/60 dark:border-neutral-700/40 overflow-hidden">
      {/* File tab header */}
      <div className={FILE_TAB}>
        <span className="text-[10px]">📝</span>
        <span className="truncate" title={parsed.file_path}>
          {shortPath(parsed.file_path)}
        </span>
        {parsed.replace_all && (
          <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300/50 dark:border-amber-700/30">
            replace all
          </span>
        )}
      </div>

      {/* Diff lines */}
      <div className="bg-neutral-50 dark:bg-neutral-900/80 text-[11px] font-mono overflow-x-auto">
        {visible.map((line, i) => (
          <div
            key={i}
            className={cn(
              "flex min-h-[1.25rem] leading-[1.25rem]",
              line.type === "removed" &&
                "bg-red-100/70 dark:bg-red-950/40 text-red-800 dark:text-red-300",
              line.type === "added" &&
                "bg-green-100/70 dark:bg-green-950/40 text-green-800 dark:text-green-300",
              line.type === "context" &&
                "text-neutral-600 dark:text-neutral-400",
            )}
          >
            <span
              className={cn(
                "select-none w-5 text-center shrink-0",
                line.type === "removed" &&
                  "text-red-500/70 dark:text-red-400/60",
                line.type === "added" &&
                  "text-green-500/70 dark:text-green-400/60",
                line.type === "context" &&
                  "text-neutral-400/50 dark:text-neutral-600/50",
              )}
            >
              {line.type === "removed"
                ? "−"
                : line.type === "added"
                  ? "+"
                  : " "}
            </span>
            <span className="whitespace-pre-wrap break-all pr-3">
              {line.text}
            </span>
          </div>
        ))}
      </div>

      {/* Collapse toggle */}
      {diffLines.length > DIFF_COLLAPSE_LINES && (
        <div className="px-3 py-1 bg-neutral-50 dark:bg-neutral-900/80 border-t border-neutral-200/40 dark:border-neutral-700/30">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-primary hover:underline cursor-pointer"
          >
            {expanded
              ? "Show less"
              : `Show ${diffLines.length - DIFF_COLLAPSE_LINES} more lines`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Write tool — file content with syntax highlighting header
// ---------------------------------------------------------------------------

interface WriteInput {
  file_path: string;
  content: string;
}

function parseWriteInput(input: unknown): WriteInput | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.file_path !== "string") return null;
  if (typeof obj.content !== "string") return null;
  return { file_path: obj.file_path, content: obj.content };
}

const WRITE_COLLAPSE_LINES = 15;

export function WriteCallRenderer({ input }: { input: unknown }) {
  const parsed = useMemo(() => parseWriteInput(input), [input]);
  const [expanded, setExpanded] = useState(false);

  if (!parsed) return null;

  const lines = parsed.content.split("\n");
  const lang = langFromPath(parsed.file_path);
  const shouldCollapse = lines.length > WRITE_COLLAPSE_LINES && !expanded;
  const visibleLines = shouldCollapse
    ? lines.slice(0, WRITE_COLLAPSE_LINES)
    : lines;

  return (
    <div className="rounded-md border border-neutral-200/60 dark:border-neutral-700/40 overflow-hidden">
      {/* File tab header */}
      <div className={FILE_TAB}>
        <span className="text-[10px]">📄</span>
        <span className="truncate" title={parsed.file_path}>
          {shortPath(parsed.file_path)}
        </span>
        {lang && (
          <span className="ml-1 text-[9px] text-neutral-400 dark:text-neutral-500">
            {lang}
          </span>
        )}
      </div>

      {/* Code content with line numbers */}
      <div className="bg-neutral-900 dark:bg-neutral-950 text-[11px] font-mono overflow-x-auto">
        {visibleLines.map((line, i) => (
          <div key={i} className="flex min-h-[1.25rem] leading-[1.25rem]">
            <span className="select-none w-10 text-right pr-3 shrink-0 text-neutral-500/50 dark:text-neutral-600/50 tabular-nums">
              {i + 1}
            </span>
            <span className="whitespace-pre-wrap break-all pr-3 text-neutral-200 dark:text-neutral-300">
              {line}
            </span>
          </div>
        ))}
      </div>

      {/* Collapse toggle */}
      {lines.length > WRITE_COLLAPSE_LINES && (
        <div className="px-3 py-1 bg-neutral-900 dark:bg-neutral-950 border-t border-neutral-700/30">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-primary hover:underline cursor-pointer"
          >
            {expanded
              ? "Show less"
              : `Show ${lines.length - WRITE_COLLAPSE_LINES} more lines`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read tool — syntax-highlighted result with filename header
// ---------------------------------------------------------------------------

interface ReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

function parseReadInput(input: unknown): ReadInput | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.file_path !== "string") return null;
  return {
    file_path: obj.file_path,
    offset: typeof obj.offset === "number" ? obj.offset : undefined,
    limit: typeof obj.limit === "number" ? obj.limit : undefined,
  };
}

const READ_COLLAPSE_LINES = 20;

export function ReadResultRenderer({
  content,
  filePath,
}: {
  content: string;
  filePath: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Read results from Claude tools come as "  1\tline content" (cat -n format)
  // Parse line numbers if present, otherwise just split lines
  const parsedLines = useMemo(() => {
    const raw = content.split("\n");
    return raw.map((line) => {
      const m = line.match(/^\s*(\d+)\t(.*)$/);
      if (m) {
        return { num: parseInt(m[1], 10), text: m[2] };
      }
      return { num: null, text: line };
    });
  }, [content]);

  const hasLineNumbers = parsedLines.some((l) => l.num !== null);
  const lang = langFromPath(filePath);
  const shouldCollapse =
    parsedLines.length > READ_COLLAPSE_LINES && !expanded;
  const visible = shouldCollapse
    ? parsedLines.slice(0, READ_COLLAPSE_LINES)
    : parsedLines;

  return (
    <div className="rounded-md border border-neutral-200/60 dark:border-neutral-700/40 overflow-hidden">
      {/* File tab header */}
      <div className={FILE_TAB}>
        <span className="text-[10px]">📖</span>
        <span className="truncate" title={filePath}>
          {shortPath(filePath)}
        </span>
        {lang && (
          <span className="ml-1 text-[9px] text-neutral-400 dark:text-neutral-500">
            {lang}
          </span>
        )}
      </div>

      {/* Code content */}
      <div className="bg-neutral-900 dark:bg-neutral-950 text-[11px] font-mono overflow-x-auto">
        {visible.map((line, i) => (
          <div key={i} className="flex min-h-[1.25rem] leading-[1.25rem]">
            {hasLineNumbers && (
              <span className="select-none w-10 text-right pr-3 shrink-0 text-neutral-500/50 dark:text-neutral-600/50 tabular-nums">
                {line.num ?? ""}
              </span>
            )}
            <span className="whitespace-pre-wrap break-all pr-3 text-neutral-200 dark:text-neutral-300">
              {line.text}
            </span>
          </div>
        ))}
      </div>

      {/* Collapse toggle */}
      {parsedLines.length > READ_COLLAPSE_LINES && (
        <div className="px-3 py-1 bg-neutral-900 dark:bg-neutral-950 border-t border-neutral-700/30">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-primary hover:underline cursor-pointer"
          >
            {expanded
              ? "Show less"
              : `Show ${parsedLines.length - READ_COLLAPSE_LINES} more lines`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports for use in TranscriptRenderer
// ---------------------------------------------------------------------------

/** Check if a tool_call input is an Edit call and return parsed data */
export function isEditInput(input: unknown): boolean {
  return parseEditInput(input) !== null;
}

/** Check if a tool_call input is a Write call */
export function isWriteInput(input: unknown): boolean {
  return parseWriteInput(input) !== null;
}

/** Extract file_path from a Read tool_call input */
export function getReadFilePath(input: unknown): string | null {
  const parsed = parseReadInput(input);
  return parsed?.file_path ?? null;
}

/** Get a brief description for code tool accordion headers */
export function getCodeToolDescription(
  toolName: string,
  input: unknown,
): string | null {
  if (toolName === "Edit") {
    const parsed = parseEditInput(input);
    if (parsed) return shortPath(parsed.file_path);
  }
  if (toolName === "Write") {
    const parsed = parseWriteInput(input);
    if (parsed) return shortPath(parsed.file_path);
  }
  if (toolName === "Read") {
    const parsed = parseReadInput(input);
    if (parsed) return shortPath(parsed.file_path);
  }
  return null;
}
