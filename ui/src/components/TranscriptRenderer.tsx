import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, formatTokens } from "../lib/utils";
import type { TranscriptEntry } from "../adapters";
import { CollapsibleContent } from "./CollapsibleContent";
import { SpecializedToolResult } from "./ToolResultRenderers";

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

/** Find the name of the most recent tool_call before a given index */
function findPrecedingToolCallName(entries: TranscriptEntry[], idx: number): string | null {
  for (let i = idx - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.kind === "tool_call") return e.name;
    // Stop searching if we hit another tool_result (different pair)
    if (e.kind === "tool_result") return null;
  }
  return null;
}

export function TranscriptRenderer({
  entries,
  compact = false,
}: {
  entries: TranscriptEntry[];
  compact?: boolean;
}) {
  // Build toolUseId → toolName map for correlating tool_call with tool_result
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text}</ReactMarkdown>
              </div>
            </div>
          );
        }

        if (entry.kind === "thinking") {
          return (
            <div key={`${entry.ts}-thinking-${idx}`} className={cn(GRID, "py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-green-600/60 dark:text-green-300/60")}>thinking</span>
              <div className={cn(CONTENT_CELL, "text-green-800/60 dark:text-green-100/60 italic prose prose-sm dark:prose-invert prose-green max-w-none opacity-60 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0")}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text}</ReactMarkdown>
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text}</ReactMarkdown>
              </div>
            </div>
          );
        }

        if (entry.kind === "tool_call") {
          const isBash = entry.name === "Bash";
          const bashInput = isBash ? (entry.input as { command?: string; description?: string }) : null;

          if (compact) {
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

          // Bash tool calls get terminal-style rendering
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

          // Default tool_call rendering
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
          const precedingToolName = findPrecedingToolCallName(entries, idx);
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

          // Bash tool results get terminal-style output rendering
          if (isBashResult) {
            return (
              <div key={`${entry.ts}-toolres-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
                <span className={TS_CELL}>{time}</span>
                <span className={cn(LBL_CELL, "text-green-500 dark:text-green-400 font-mono")}>output</span>
                <span className="min-w-0 flex items-center gap-1.5">
                  {entry.isError ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/30 text-red-400 border border-red-700/30">
                      ✕ error
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-900/30 text-green-400 border border-green-700/30">
                      ✓ exit 0
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

          // Default tool_result rendering
          return (
            <div key={`${entry.ts}-toolres-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, entry.isError ? "text-red-600 dark:text-red-300" : "text-purple-600 dark:text-purple-300")}>tool_result</span>
              {entry.isError ? <span className="text-red-600 dark:text-red-400 min-w-0">error</span> : <span />}
              <CollapsiblePre className={cn(EXPAND_CELL, "bg-neutral-100 dark:bg-neutral-900 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap text-neutral-700 dark:text-neutral-300")}>
                {formatContent(entry.content)}
              </CollapsiblePre>
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
