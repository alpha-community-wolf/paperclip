import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { cn } from "../lib/utils";

const COLLAPSE_THRESHOLD = 10; // collapse if more than 10 results
const READ_COLLAPSE_LINES = 40; // collapse Read results after this many lines

// ---------------------------------------------------------------------------
// Glob result renderer — compact file list
// ---------------------------------------------------------------------------

interface GlobEntry {
  path: string;
}

function parseGlobResult(content: string): GlobEntry[] | null {
  // Glob results are newline-separated file paths
  const lines = content.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return null;
  // Heuristic: every line should look like a file path (no colons with line numbers)
  const allPaths = lines.every(
    (l) => !l.includes(": ") && !l.match(/:\d+:/) && l.length < 500,
  );
  if (!allPaths) return null;
  return lines.map((path) => ({ path: path.trim() }));
}

function fileIcon(path: string): string {
  if (path.endsWith("/")) return "📁";
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "🟦";
    case "js":
    case "jsx":
      return "🟨";
    case "json":
      return "📋";
    case "md":
      return "📝";
    case "css":
    case "scss":
      return "🎨";
    case "yml":
    case "yaml":
      return "⚙️";
    default:
      return "📄";
  }
}

export function GlobResultRenderer({ content }: { content: string }) {
  const entries = useMemo(() => parseGlobResult(content), [content]);
  const [expanded, setExpanded] = useState(false);

  if (!entries) return null;

  const shouldCollapse = entries.length > COLLAPSE_THRESHOLD;
  const visible = shouldCollapse && !expanded ? entries.slice(0, COLLAPSE_THRESHOLD) : entries;

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">
        <span className="font-medium">{entries.length} file{entries.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-0">
        {visible.map((entry, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 py-px text-[11px] font-mono text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 rounded px-1 -mx-1"
          >
            <span className="text-[10px] shrink-0">{fileIcon(entry.path)}</span>
            <span className="truncate">{entry.path}</span>
          </div>
        ))}
      </div>
      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-primary hover:underline mt-1 cursor-pointer"
        >
          {expanded ? "Show less" : `Show ${entries.length - COLLAPSE_THRESHOLD} more files`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grep result renderer — matched lines with highlighted terms
// ---------------------------------------------------------------------------

interface GrepMatch {
  file: string;
  line: number | null;
  text: string;
}

interface GrepGroup {
  file: string;
  matches: { line: number | null; text: string }[];
}

function parseGrepResult(content: string): GrepGroup[] | null {
  const lines = content.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return null;

  const matches: GrepMatch[] = [];

  for (const line of lines) {
    // Match patterns like "file.ts:42:  const foo = bar" or "file.ts:42-  context line"
    const m = line.match(/^(.+?):(\d+)[:|-]\s*(.*)$/);
    if (m) {
      matches.push({ file: m[1], line: parseInt(m[2], 10), text: m[3] });
      continue;
    }
    // Also match "file.ts: content" (no line number)
    const m2 = line.match(/^(.+?\.\w+):\s*(.+)$/);
    if (m2) {
      matches.push({ file: m2[1], line: null, text: m2[2] });
    }
    // Skip lines that don't match either pattern (headers, separators, etc.)
  }

  if (matches.length === 0) return null;

  // Group by file
  const groups: GrepGroup[] = [];
  const groupMap = new Map<string, GrepGroup>();
  for (const match of matches) {
    let group = groupMap.get(match.file);
    if (!group) {
      group = { file: match.file, matches: [] };
      groupMap.set(match.file, group);
      groups.push(group);
    }
    group.matches.push({ line: match.line, text: match.text });
  }

  return groups;
}

function GrepFileGroup({ group, defaultExpanded }: { group: GrepGroup; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b border-neutral-200/50 dark:border-neutral-700/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 rounded px-1 -mx-1 cursor-pointer"
      >
        <span className="text-[10px] text-neutral-400 shrink-0">{expanded ? "▼" : "▶"}</span>
        <span className="text-[11px] font-mono text-neutral-700 dark:text-neutral-300 truncate">
          {group.file}
        </span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">
          ({group.matches.length})
        </span>
      </button>
      {expanded && (
        <div className="pl-4 pb-1">
          {group.matches.map((match, i) => (
            <div
              key={i}
              className="flex gap-2 py-px text-[11px] font-mono"
            >
              {match.line !== null && (
                <span className="text-neutral-400 dark:text-neutral-600 select-none w-8 text-right shrink-0 tabular-nums">
                  {match.line}
                </span>
              )}
              <span className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-all min-w-0">
                {match.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function GrepResultRenderer({ content }: { content: string }) {
  const groups = useMemo(() => parseGrepResult(content), [content]);
  const [showAll, setShowAll] = useState(false);

  if (!groups) return null;

  const totalMatches = groups.reduce((sum, g) => sum + g.matches.length, 0);
  const shouldCollapse = groups.length > COLLAPSE_THRESHOLD;
  const visibleGroups = shouldCollapse && !showAll ? groups.slice(0, COLLAPSE_THRESHOLD) : groups;

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">
        <span className="font-medium">
          {totalMatches} match{totalMatches !== 1 ? "es" : ""} in {groups.length} file{groups.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-0">
        {visibleGroups.map((group, i) => (
          <GrepFileGroup
            key={group.file}
            group={group}
            defaultExpanded={i < 3}
          />
        ))}
      </div>
      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-[10px] text-primary hover:underline mt-1 cursor-pointer"
        >
          {showAll ? "Show less" : `Show ${groups.length - COLLAPSE_THRESHOLD} more files`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read result renderer — syntax-highlighted code with filename tab + line numbers
// ---------------------------------------------------------------------------

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", mts: "typescript", cts: "typescript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
  kt: "kotlin", swift: "swift", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
  cs: "csharp", sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  json: "json", yaml: "yaml", yml: "yaml", toml: "ini", xml: "xml",
  html: "html", htm: "html", css: "css", scss: "scss", less: "less",
  sql: "sql", md: "markdown", mdx: "markdown", graphql: "graphql",
  dockerfile: "dockerfile", makefile: "makefile",
  lua: "lua", r: "r", php: "php", pl: "perl", ex: "elixir", erl: "erlang",
  hs: "haskell", ml: "ocaml", vim: "vim", tf: "hcl",
};

interface ReadLine {
  lineNumber: number;
  content: string;
}

function parseReadResult(content: string): ReadLine[] | null {
  const rawLines = content.split("\n");
  const parsed: ReadLine[] = [];

  for (const line of rawLines) {
    const m = line.match(/^\s*(\d+)→(.*)$/);
    if (m) {
      parsed.push({ lineNumber: parseInt(m[1], 10), content: m[2] });
    }
  }

  if (parsed.length < 2) return null;
  if (parsed.length < rawLines.filter(Boolean).length * 0.6) return null;
  return parsed;
}

function detectLanguage(filePath: string): string | null {
  const basename = filePath.split("/").pop() ?? "";
  const lowerBase = basename.toLowerCase();
  if (lowerBase === "dockerfile") return "dockerfile";
  if (lowerBase === "makefile") return "makefile";

  const ext = basename.includes(".") ? basename.split(".").pop()?.toLowerCase() : null;
  return ext ? EXT_TO_LANG[ext] ?? null : null;
}

export function ReadResultRenderer({
  content,
  filePath,
}: {
  content: string;
  filePath?: string;
}) {
  const parsed = useMemo(() => parseReadResult(content), [content]);
  const [expanded, setExpanded] = useState(false);

  if (!parsed) return null;

  const lang = filePath ? detectLanguage(filePath) : null;
  const fileName = filePath ? filePath.split("/").pop() : null;
  const shouldCollapse = parsed.length > READ_COLLAPSE_LINES;
  const visibleLines = shouldCollapse && !expanded ? parsed.slice(0, READ_COLLAPSE_LINES) : parsed;
  const codeContent = visibleLines.map((l) => l.content).join("\n");
  const fenced = "```" + (lang || "") + "\n" + codeContent + "\n```";

  const maxLineNum = visibleLines[visibleLines.length - 1]?.lineNumber ?? 1;
  const gutterWidth = String(maxLineNum).length;

  return (
    <div className="rounded-md border border-neutral-200/60 dark:border-neutral-700/40 overflow-hidden">
      {fileName && (
        <div className="flex items-center gap-2 px-3 py-1 bg-neutral-100 dark:bg-neutral-800/60 border-b border-neutral-200/60 dark:border-neutral-700/40">
          <span className="text-[10px] shrink-0">{fileIcon(filePath ?? "")}</span>
          <span className="text-[11px] font-mono font-medium text-neutral-600 dark:text-neutral-300 truncate">
            {fileName}
          </span>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
            {parsed.length} line{parsed.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="flex bg-neutral-50 dark:bg-neutral-900/80">
        <div
          className="shrink-0 py-2 pr-2 pl-2 text-right select-none border-r border-neutral-200/40 dark:border-neutral-700/30 bg-neutral-100/50 dark:bg-neutral-800/30"
          style={{ minWidth: `${gutterWidth + 2}ch` }}
        >
          {visibleLines.map((l) => (
            <div
              key={l.lineNumber}
              className="text-[11px] leading-[1.45] font-mono text-neutral-400 dark:text-neutral-600 tabular-nums"
            >
              {l.lineNumber}
            </div>
          ))}
        </div>

        <div className={cn(
          "flex-1 min-w-0 overflow-x-auto py-2 px-3",
          "[&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:!bg-transparent [&_pre]:!border-0",
          "[&_code]:!text-[11px] [&_code]:!leading-[1.45] [&_code]:!bg-transparent",
        )}>
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
            {fenced}
          </ReactMarkdown>
        </div>
      </div>

      {shouldCollapse && (
        <div className="px-3 py-1.5 border-t border-neutral-200/40 dark:border-neutral-700/30 bg-neutral-50 dark:bg-neutral-900/50">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-primary hover:underline cursor-pointer"
          >
            {expanded ? "Show less" : `Show all ${parsed.length} lines (${parsed.length - READ_COLLAPSE_LINES} more)`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher — tries specialized renderers, returns null if no match
// ---------------------------------------------------------------------------

export function SpecializedToolResult({
  toolName,
  content,
  className,
  filePath,
}: {
  toolName: string | undefined;
  content: string;
  className?: string;
  filePath?: string;
}) {
  // Read tool: syntax-highlighted code viewer
  if (toolName === "Read") {
    const renderer = <ReadResultRenderer content={content} filePath={filePath} />;
    if (renderer) {
      return <div className={className}>{renderer}</div>;
    }
  }

  // Dispatch by tool name when available
  if (toolName === "Glob") {
    const renderer = <GlobResultRenderer content={content} />;
    if (renderer) {
      return <div className={className}>{renderer}</div>;
    }
  }

  if (toolName === "Grep") {
    const renderer = <GrepResultRenderer content={content} />;
    if (renderer) {
      return <div className={className}>{renderer}</div>;
    }
  }

  // Content-based fallback when toolName is not available
  if (!toolName) {
    // Try Glob first (simpler format)
    const globEntries = parseGlobResult(content);
    if (globEntries && globEntries.length >= 2) {
      return (
        <div className={className}>
          <GlobResultRenderer content={content} />
        </div>
      );
    }

    // Try Grep
    const grepGroups = parseGrepResult(content);
    if (grepGroups && grepGroups.length >= 1) {
      return (
        <div className={className}>
          <GrepResultRenderer content={content} />
        </div>
      );
    }
  }

  return null;
}
