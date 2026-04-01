import { useState } from "react";
import { cn } from "../lib/utils";
import type { TranscriptEntry } from "../adapters";

type ToolCallEntry = Extract<TranscriptEntry, { kind: "tool_call" }>;
type ToolResultEntry = Extract<TranscriptEntry, { kind: "tool_result" }>;

export interface ToolCallPair {
  call: ToolCallEntry;
  result: ToolResultEntry | null;
  /** Index of the tool_call in the original entries array (for stable keys) */
  callIndex: number;
}

/** Compute duration string between two timestamps */
function formatDuration(startTs: string, endTs: string): string {
  const ms = new Date(endTs).getTime() - new Date(startTs).getTime();
  if (ms < 0) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export function ToolCallAccordion({
  pair,
  renderCallContent,
  renderResultContent,
  description,
}: {
  pair: ToolCallPair;
  renderCallContent: () => React.ReactNode;
  renderResultContent: () => React.ReactNode | null;
  description?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const { call, result } = pair;

  const isBash = call.name === "Bash";
  const toolLabel = isBash ? "bash" : call.name;
  const duration = result ? formatDuration(call.ts, result.ts) : null;
  const isError = result?.isError ?? false;
  const isPending = !result;

  return (
    <div className={cn(
      "rounded-md border overflow-hidden",
      isError
        ? "border-red-300/50 dark:border-red-700/40"
        : "border-neutral-200/60 dark:border-neutral-700/40",
    )}>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-2 w-full text-left px-3 py-1.5 text-[11px] cursor-pointer",
          "hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors",
          isError
            ? "bg-red-50/50 dark:bg-red-950/20"
            : "bg-neutral-50 dark:bg-neutral-800/20",
        )}
      >
        {/* Chevron */}
        <span className="text-[10px] text-neutral-400 shrink-0 w-3">
          {expanded ? "▼" : "▶"}
        </span>

        {/* Tool name */}
        <span className={cn(
          "font-medium font-mono shrink-0",
          isBash ? "text-green-600 dark:text-green-400" : "text-yellow-700 dark:text-yellow-300",
        )}>
          {toolLabel}
        </span>

        {/* Brief description for Bash */}
        {isBash && (call.input as { description?: string })?.description && (
          <span className="text-neutral-500 dark:text-neutral-400 truncate min-w-0">
            {(call.input as { description?: string }).description}
          </span>
        )}

        {/* Description for non-Bash tools (e.g. file path for Edit/Write/Read) */}
        {!isBash && description && (
          <span className="text-neutral-500 dark:text-neutral-400 truncate min-w-0 font-mono">
            {description}
          </span>
        )}

        <span className="flex-1" />

        {/* Duration badge */}
        {duration && (
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums shrink-0">
            {duration}
          </span>
        )}

        {/* Status badge */}
        {isPending ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300/50 dark:border-yellow-700/30 shrink-0">
            running
          </span>
        ) : isError ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300/50 dark:border-red-700/30 shrink-0">
            error
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300/50 dark:border-green-700/30 shrink-0">
            ok
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-neutral-200/60 dark:border-neutral-700/40">
          {/* Tool call input */}
          <div className="px-3 py-2">
            <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1">
              Input
            </div>
            {renderCallContent()}
          </div>

          {/* Tool result output */}
          {result && (
            <div className="px-3 py-2 border-t border-neutral-200/40 dark:border-neutral-700/30">
              <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1">
                Output
              </div>
              {renderResultContent()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
