import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn, formatTokens } from "../lib/utils";
import type { TranscriptEntry } from "../adapters";
import { CollapsibleContent } from "./CollapsibleContent";
import { SpecializedToolResult } from "./ToolResultRenderers";
import { ToolCallAccordion } from "./ToolCallAccordion";
import type { ToolCallPair } from "./ToolCallAccordion";

const GRID = "grid grid-cols-[auto_auto_1fr] gap-x-2 sm:gap-x-3 items-baseline";
const TS_CELL = "text-neutral-400 dark:text-neutral-600 select-none w-12 sm:w-16 text-[10px] sm:text-xs tabular-nums";
const LBL_CELL = "w-14 sm:w-20 text-[10px] sm:text-xs";
const CONTENT_CELL = "min-w-0 whitespace-pre-wrap break-words overflow-hidden";
const EXPAND_CELL = "col-span-full md:col-start-3 md:col-span-1";

const COLLAPSE_HEIGHT = 144; // ~6 lines at 11px font + padding

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

/** Syntax-highlighted JSON rendering */
function JsonHighlight({ value }: { value: string }) {
  // Tokenize JSON string into colored spans
  const tokens = value.split(/("(?:[^"\\]|\\.)*")\s*(:)?|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g);
  const parts: React.ReactNode[] = [];
  let i = 0;

  for (const token of tokens) {
    if (token === undefined || token === "") { i++; continue; }
    const key = `t${i++}`;
    // Key (string followed by colon)
    if (/^"/.test(token) && tokens[i] === ":") {
      parts.push(<span key={key} className="text-purple-600 dark:text-purple-400">{token}</span>);
    }
    // Colon separator
    else if (token === ":") {
      parts.push(<span key={key}>{token} </span>);
    }
    // String value
    else if (/^"/.test(token)) {
      parts.push(<span key={key} className="text-green-700 dark:text-green-400">{token}</span>);
    }
    // Boolean / null
    else if (/^(true|false|null)$/.test(token)) {
      parts.push(<span key={key} className="text-red-600 dark:text-red-400">{token}</span>);
    }
    // Number
    else if (/^-?\d/.test(token)) {
      parts.push(<span key={key} className="text-orange-600 dark:text-orange-400">{token}</span>);
    }
    // Structural characters and whitespace
    else {
      parts.push(<span key={key}>{token}</span>);
    }
  }

  return <>{parts}</>;
}

/** Check if content contains fenced code blocks */
function hasFencedCodeBlocks(content: string): boolean {
  return /^```[\w-]*/m.test(content);
}

/** Format and optionally highlight content that might be JSON */
function formatContent(content: string): React.ReactNode {
  try {
    const formatted = JSON.stringify(JSON.parse(content), null, 2);
    return <JsonHighlight value={formatted} />;
  } catch {
    return content;
  }
}

/** Wraps a pre block with expand/collapse when content exceeds COLLAPSE_HEIGHT */
function CollapsiblePre({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (ref.current) {
      setOverflows(ref.current.scrollHeight > COLLAPSE_HEIGHT);
    }
  }, [children]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <div className="relative">
      <pre
        ref={ref}
        className={cn(className, !expanded && overflows && "overflow-hidden")}
        style={!expanded && overflows ? { maxHeight: COLLAPSE_HEIGHT } : undefined}
      >
        {children}
      </pre>
      {!expanded && overflows && (
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-neutral-200 dark:from-neutral-900 to-transparent pointer-events-none" />
      )}
      {overflows && (
        <button
          type="button"
          onClick={toggle}
          className="text-[10px] text-primary hover:underline mt-0.5 cursor-pointer"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

type ThinkingEntry = Extract<TranscriptEntry, { kind: "thinking" }>;
type ToolCallEntry = Extract<TranscriptEntry, { kind: "tool_call" }>;
type ToolResultEntry = Extract<TranscriptEntry, { kind: "tool_result" }>;

/** A run of consecutive thinking entries grouped together */
interface ThinkingGroupData {
  entries: ThinkingEntry[];
  startIndex: number;
  indices: Set<number>;
}

/** Group consecutive thinking entries into collapsible blocks */
function useThinkingGroups(entries: TranscriptEntry[]) {
  return useMemo(() => {
    const groups: ThinkingGroupData[] = [];
    const indexToGroup = new Map<number, ThinkingGroupData>();

    let currentGroup: ThinkingGroupData | null = null;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].kind === "thinking") {
        if (!currentGroup) {
          currentGroup = { entries: [], startIndex: i, indices: new Set() };
        }
        currentGroup.entries.push(entries[i] as ThinkingEntry);
        currentGroup.indices.add(i);
        indexToGroup.set(i, currentGroup);
      } else {
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
      }
    }
    if (currentGroup) groups.push(currentGroup);

    return { groups, indexToGroup };
  }, [entries]);
}

/** Collapsible block for a group of thinking entries */
function ThinkingGroup({ group }: { group: ThinkingGroupData }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const entryCount = group.entries.length;
  const firstTime = fmtTime(group.entries[0].ts);
  const lastTime = entryCount > 1 ? fmtTime(group.entries[entryCount - 1].ts) : null;

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          GRID,
          "w-full text-left cursor-pointer group hover:bg-neutral-100/50 dark:hover:bg-neutral-800/30 rounded transition-colors",
        )}
      >
        <span className={TS_CELL}>{firstTime}</span>
        <span className={cn(LBL_CELL, "text-violet-500/70 dark:text-violet-400/70")}>
          thinking
        </span>
        <span className="min-w-0 flex items-center gap-2 text-[11px] text-neutral-400 dark:text-neutral-500">
          <svg
            className={cn(
              "w-3 h-3 shrink-0 transition-transform duration-150",
              expanded && "rotate-90",
            )}
            viewBox="0 0 12 12"
            fill="currentColor"
          >
            <path d="M4.5 2L9 6L4.5 10V2Z" />
          </svg>
          <span className="italic">
            {expanded ? "Thinking" : "Thinking\u2026"}{" "}
            <span className="text-neutral-400/60 dark:text-neutral-500/60 not-italic">
              ({entryCount} {entryCount === 1 ? "block" : "blocks"}{lastTime ? `, ${firstTime}\u2013${lastTime}` : ""})
            </span>
          </span>
        </span>
      </button>

      {expanded && (
        <div className="ml-0 mt-1 mb-1 border-l-2 border-violet-300/30 dark:border-violet-500/20 pl-3">
          {group.entries.map((entry, i) => (
            <div
              key={`thinking-group-${group.startIndex}-${i}`}
              className={cn(GRID, "py-0.5")}
            >
              <span className={TS_CELL}>{fmtTime(entry.ts)}</span>
              <span className={cn(LBL_CELL, "text-violet-500/50 dark:text-violet-400/50 text-[9px]")}>
                {i + 1}/{entryCount}
              </span>
              <div className={cn(
                CONTENT_CELL,
                "text-neutral-600/80 dark:text-neutral-400/80 italic prose prose-sm dark:prose-invert max-w-none opacity-70",
                "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
              )}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {entry.text}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Build pairing data structures:
 * - toolUseId → tool_call entry + index
 * - toolUseId → tool_result entry
 * - Set of result indices that are consumed by pairs
 */
function useToolPairing(entries: TranscriptEntry[]) {
  return useMemo(() => {
    const callMap = new Map<string, { entry: ToolCallEntry; index: number }>();
    const resultMap = new Map<string, ToolResultEntry>();
    const consumedResultIndices = new Set<number>();

    // First pass: index tool_calls by toolUseId
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.kind === "tool_call" && e.toolUseId) {
        callMap.set(e.toolUseId, { entry: e, index: i });
      }
    }

    // Second pass: index tool_results and mark consumed
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.kind === "tool_result" && e.toolUseId && callMap.has(e.toolUseId)) {
        resultMap.set(e.toolUseId, e);
        consumedResultIndices.add(i);
      }
    }

    return { callMap, resultMap, consumedResultIndices };
  }, [entries]);
}

/** Render the input content for a tool_call inside an accordion */
function AccordionCallContent({ entry }: { entry: ToolCallEntry }) {
  const isBash = entry.name === "Bash";
  const bashInput = isBash ? (entry.input as { command?: string; description?: string }) : null;

  if (isBash && bashInput) {
    return (
      <div className="bg-neutral-900 dark:bg-neutral-950 rounded-md border border-neutral-700/50 dark:border-neutral-700/30 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="text-green-400 text-[11px] font-mono font-medium select-none">$</span>
          <code className="text-green-300 dark:text-green-300 text-[11px] font-mono break-all">
            {bashInput.command || ""}
          </code>
        </div>
      </div>
    );
  }

  return (
    <CollapsiblePre className="bg-neutral-200 dark:bg-neutral-900 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap text-neutral-800 dark:text-neutral-200">
      <JsonHighlight value={JSON.stringify(entry.input, null, 2)} />
    </CollapsiblePre>
  );
}

/** Render the output content for a tool_result inside an accordion */
function AccordionResultContent({
  entry,
  toolName,
}: {
  entry: ToolResultEntry;
  toolName: string | undefined;
}) {
  const isBash = toolName === "Bash";

  // Bash output: terminal style
  if (isBash) {
    return (
      <div className="bg-neutral-900 dark:bg-neutral-950 rounded-md border border-neutral-700/50 dark:border-neutral-700/30 overflow-hidden">
        <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words overflow-x-auto text-neutral-300 dark:text-neutral-400">
          <CollapsibleContent>{entry.content}</CollapsibleContent>
        </pre>
      </div>
    );
  }

  // Grep/Glob specialized rendering
  if (!entry.isError) {
    const specialized = (
      <SpecializedToolResult
        toolName={toolName}
        content={entry.content}
        className="bg-neutral-50 dark:bg-neutral-900 rounded p-2 text-[11px]"
      />
    );
    if (specialized) return specialized;
  }

  // Default: JSON-highlighted or plain text
  return (
    <CollapsiblePre className={cn(
      "bg-neutral-100 dark:bg-neutral-900 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap",
      entry.isError ? "text-red-700 dark:text-red-300" : "text-neutral-700 dark:text-neutral-300",
    )}>
      {formatContent(entry.content)}
    </CollapsiblePre>
  );
}

export function TranscriptRenderer({
  entries,
  compact = false,
}: {
  entries: TranscriptEntry[];
  compact?: boolean;
}) {
  const { callMap, resultMap, consumedResultIndices } = useToolPairing(entries);
  const { indexToGroup } = useThinkingGroups(entries);

  // Build toolUseId → toolName map (for tool_results without accordion pairing)
  const toolNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      if (entry.kind === "tool_call" && entry.toolUseId) {
        map.set(entry.toolUseId, entry.name);
      }
    }
    return map;
  }, [entries]);

  if (entries.length === 0) {
    return <div className="text-neutral-500 text-xs">No transcript entries yet.</div>;
  }

  return (
    <>
      {entries.map((entry, idx) => {
        const time = fmtTime(entry.ts);

        if (entry.kind === "assistant") {
          return (
            <div key={`${entry.ts}-assistant-${idx}`} className={cn(GRID, "py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-green-700 dark:text-green-300")}>assistant</span>
              <div className={cn(CONTENT_CELL, "text-green-900 dark:text-green-100 prose prose-sm dark:prose-invert prose-green max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0")}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{entry.text}</ReactMarkdown>
              </div>
            </div>
          );
        }

        if (entry.kind === "thinking") {
          const group = indexToGroup.get(idx);
          if (group) {
            // Only render at the group's first entry; skip subsequent entries
            if (idx !== group.startIndex) return null;
            return (
              <ThinkingGroup
                key={`thinking-group-${group.startIndex}`}
                group={group}
              />
            );
          }
          // Orphan thinking entry (shouldn't happen, but fallback)
          return (
            <div key={`${entry.ts}-thinking-${idx}`} className={cn(GRID, "py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-violet-500/70 dark:text-violet-400/70")}>thinking</span>
              <div className={cn(CONTENT_CELL, "text-neutral-600/80 dark:text-neutral-400/80 italic prose prose-sm dark:prose-invert max-w-none opacity-70 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0")}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{entry.text}</ReactMarkdown>
              </div>
            </div>
          );
        }

        if (entry.kind === "user") {
          return (
            <div key={`${entry.ts}-user-${idx}`} className={cn(GRID, "py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-neutral-500 dark:text-neutral-400")}>user</span>
              <div className={cn(CONTENT_CELL, "text-neutral-700 dark:text-neutral-300 prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0")}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{entry.text}</ReactMarkdown>
              </div>
            </div>
          );
        }

        if (entry.kind === "tool_call") {
          // Compact mode: unchanged
          if (compact) {
            const isBash = entry.name === "Bash";
            const bashInput = isBash ? (entry.input as { command?: string; description?: string }) : null;
            return (
              <div key={`${entry.ts}-tool-${idx}`} className={cn(GRID, "py-0.5")}>
                <span className={TS_CELL}>{time}</span>
                <span className={cn(LBL_CELL, isBash ? "text-green-500 dark:text-green-400" : "text-yellow-700 dark:text-yellow-300")}>
                  {isBash ? "bash" : "tool"}
                </span>
                <span className={cn("min-w-0 truncate", isBash ? "text-green-300 dark:text-green-400 font-mono" : "text-yellow-900 dark:text-yellow-100")}>
                  {isBash && bashInput?.command ? `$ ${bashInput.command}` : entry.name}
                </span>
              </div>
            );
          }

          // Accordion: pair tool_call with its tool_result
          if (entry.toolUseId) {
            const result = resultMap.get(entry.toolUseId) ?? null;
            const pair: ToolCallPair = { call: entry, result, callIndex: idx };

            return (
              <div key={`${entry.ts}-toolpair-${idx}`} className={cn(GRID, "py-0.5")}>
                <span className={TS_CELL}>{time}</span>
                <span className={cn(LBL_CELL, "text-yellow-700 dark:text-yellow-300 text-[10px]")}>tool</span>
                <div className={cn(CONTENT_CELL)}>
                  <ToolCallAccordion
                    pair={pair}
                    renderCallContent={() => <AccordionCallContent entry={entry} />}
                    renderResultContent={() =>
                      result ? (
                        <AccordionResultContent
                          entry={result}
                          toolName={entry.name}
                        />
                      ) : null
                    }
                  />
                </div>
              </div>
            );
          }

          // Fallback: tool_call without toolUseId (legacy) — render inline
          const isBash = entry.name === "Bash";
          const bashInput = isBash ? (entry.input as { command?: string; description?: string }) : null;

          if (isBash && bashInput) {
            return (
              <div key={`${entry.ts}-tool-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
                <span className={TS_CELL}>{time}</span>
                <span className={cn(LBL_CELL, "text-green-500 dark:text-green-400 font-mono")}>bash</span>
                <span className="text-neutral-500 dark:text-neutral-400 min-w-0 text-[11px] truncate">
                  {bashInput.description || ""}
                </span>
                <div className={cn(EXPAND_CELL, "bg-neutral-900 dark:bg-neutral-950 rounded-md border border-neutral-700/50 dark:border-neutral-700/30 overflow-hidden")}>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/60 dark:bg-neutral-800/40 border-b border-neutral-700/30">
                    <span className="text-green-400 text-[11px] font-mono font-medium select-none">$</span>
                    <code className="text-green-300 dark:text-green-300 text-[11px] font-mono break-all">
                      {bashInput.command || ""}
                    </code>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={`${entry.ts}-tool-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-yellow-700 dark:text-yellow-300")}>tool_call</span>
              <span className="text-yellow-900 dark:text-yellow-100 min-w-0">{entry.name}</span>
              <CollapsiblePre className={cn(EXPAND_CELL, "bg-neutral-200 dark:bg-neutral-900 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap text-neutral-800 dark:text-neutral-200")}>
                <JsonHighlight value={JSON.stringify(entry.input, null, 2)} />
              </CollapsiblePre>
            </div>
          );
        }

        if (entry.kind === "tool_result") {
          // Skip results already consumed by an accordion pair
          if (consumedResultIndices.has(idx)) {
            return null;
          }

          // Unpaired tool_result (orphan) — render standalone
          const precedingToolName = toolNameMap.get(entry.toolUseId) ?? null;
          const isBashResult = precedingToolName === "Bash";

          if (compact) {
            return (
              <div key={`${entry.ts}-toolres-${idx}`} className={cn(GRID, "py-0.5")}>
                <span className={TS_CELL}>{time}</span>
                <span className={cn(LBL_CELL, entry.isError ? "text-red-600 dark:text-red-300" : isBashResult ? "text-green-500 dark:text-green-400" : "text-purple-600 dark:text-purple-300")}>
                  {isBashResult ? "output" : "result"}
                </span>
                <span className={cn(CONTENT_CELL, entry.isError ? "text-red-600 dark:text-red-400" : "text-neutral-500", "truncate")}>
                  {entry.isError ? "error" : entry.content.slice(0, 80)}
                </span>
              </div>
            );
          }

          if (isBashResult) {
            return (
              <div key={`${entry.ts}-toolres-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
                <span className={TS_CELL}>{time}</span>
                <span className={cn(LBL_CELL, "text-green-500 dark:text-green-400 font-mono")}>output</span>
                <span className="min-w-0 flex items-center gap-1.5">
                  {entry.isError ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/30 text-red-400 border border-red-700/30">
                      error
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-900/30 text-green-400 border border-green-700/30">
                      exit 0
                    </span>
                  )}
                </span>
                <div className={cn(EXPAND_CELL, "bg-neutral-900 dark:bg-neutral-950 rounded-md border border-neutral-700/50 dark:border-neutral-700/30 overflow-hidden")}>
                  <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words overflow-x-auto text-neutral-300 dark:text-neutral-400">
                    <CollapsibleContent>{entry.content}</CollapsibleContent>
                  </pre>
                </div>
              </div>
            );
          }

          // Grep/Glob specialized rendering
          const toolName = toolNameMap.get(entry.toolUseId);
          const specializedResult = !entry.isError ? (
            <SpecializedToolResult
              toolName={toolName}
              content={entry.content}
              className={cn(EXPAND_CELL, "bg-neutral-50 dark:bg-neutral-900 rounded p-2 text-[11px]")}
            />
          ) : null;

          if (specializedResult) {
            return (
              <div key={`${entry.ts}-toolres-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
                <span className={TS_CELL}>{time}</span>
                <span className={cn(LBL_CELL, "text-purple-600 dark:text-purple-300")}>tool_result</span>
                <span />
                {specializedResult}
              </div>
            );
          }

          // Default tool_result rendering — use markdown when fenced code blocks present
          const hasCode = hasFencedCodeBlocks(entry.content);
          return (
            <div key={`${entry.ts}-toolres-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, entry.isError ? "text-red-600 dark:text-red-300" : "text-purple-600 dark:text-purple-300")}>tool_result</span>
              {entry.isError ? <span className="text-red-600 dark:text-red-400 min-w-0">error</span> : <span />}
              {hasCode ? (
                <CollapsiblePre className={cn(EXPAND_CELL, "bg-neutral-100 dark:bg-neutral-900 rounded p-2 text-[11px] overflow-x-auto text-neutral-700 dark:text-neutral-300 prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0")}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{entry.content}</ReactMarkdown>
                </CollapsiblePre>
              ) : (
                <CollapsiblePre className={cn(EXPAND_CELL, "bg-neutral-100 dark:bg-neutral-900 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap text-neutral-700 dark:text-neutral-300")}>
                  {formatContent(entry.content)}
                </CollapsiblePre>
              )}
            </div>
          );
        }

        if (entry.kind === "init") {
          return (
            <div key={`${entry.ts}-init-${idx}`} className={GRID}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-blue-700 dark:text-blue-300")}>init</span>
              <span className={cn(CONTENT_CELL, "text-blue-900 dark:text-blue-100")}>model: {entry.model}{entry.sessionId ? `, session: ${entry.sessionId}` : ""}</span>
            </div>
          );
        }

        if (entry.kind === "result") {
          return (
            <div key={`${entry.ts}-result-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-cyan-700 dark:text-cyan-300")}>result</span>
              <span className={cn(CONTENT_CELL, "text-cyan-900 dark:text-cyan-100")}>
                tokens in={formatTokens(entry.inputTokens)} out={formatTokens(entry.outputTokens)} cached={formatTokens(entry.cachedTokens)} cost=${entry.costUsd.toFixed(6)}
              </span>
              {(entry.subtype || entry.isError || entry.errors.length > 0) && (
                <div className={cn(EXPAND_CELL, "text-red-600 dark:text-red-300 whitespace-pre-wrap break-words")}>
                  subtype={entry.subtype || "unknown"} is_error={entry.isError ? "true" : "false"}
                  {entry.errors.length > 0 ? ` errors=${entry.errors.join(" | ")}` : ""}
                </div>
              )}
              {entry.text && (
                <div className={cn(EXPAND_CELL, "whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-100")}>{entry.text}</div>
              )}
            </div>
          );
        }

        if (entry.kind === "stderr" || entry.kind === "stdout") {
          const isErr = entry.kind === "stderr";
          return (
            <div key={`${entry.ts}-${entry.kind}-${idx}`} className={cn(GRID, "py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, isErr ? "text-red-600 dark:text-red-300" : "text-neutral-500")}>{entry.kind}</span>
              <pre className={cn(
                CONTENT_CELL,
                "rounded px-2 py-1 text-[11px] font-mono",
                isErr
                  ? "bg-red-950/20 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200/30 dark:border-red-800/30"
                  : "bg-neutral-900/5 dark:bg-neutral-950 text-neutral-600 dark:text-neutral-400 border border-neutral-200/30 dark:border-neutral-800/30",
              )}>
                {entry.text}
              </pre>
            </div>
          );
        }

        const isSystem = entry.kind === "system";
        return (
          <div key={`${entry.ts}-raw-${idx}`} className={GRID}>
            <span className={TS_CELL}>{time}</span>
            <span className={cn(LBL_CELL, isSystem ? "text-blue-600 dark:text-blue-300" : "text-neutral-500")}>{isSystem ? "system" : "stdout"}</span>
            <span className={cn(CONTENT_CELL, isSystem ? "text-blue-600 dark:text-blue-300" : "text-neutral-500")}>{entry.text}</span>
          </div>
        );
      })}
    </>
  );
}
