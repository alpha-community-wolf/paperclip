import { useState, useMemo } from "react";
import { cn } from "../lib/utils";

const COLLAPSE_THRESHOLD = 10; // collapse if more than 10 results

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
// Dispatcher — tries specialized renderers, returns null if no match
// ---------------------------------------------------------------------------

export function SpecializedToolResult({
  toolName,
  content,
  className,
}: {
  toolName: string | undefined;
  content: string;
  className?: string;
}) {
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
