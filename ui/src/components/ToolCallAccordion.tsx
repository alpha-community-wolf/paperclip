import { useState } from "react";
import { cn } from "../lib/utils";
import type { TranscriptEntry } from "../adapters";
import type { ParsedApiCall } from "./ApiCallRenderer";

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

/** Method badge colors for API calls */
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

function shortenUrl(url: string): string {
  let display = url.replace(/^https?:\/\//, "");
  display = display.replace(/\$\{?\w+\}?/, "…");
  if (display.length > 60) display = display.slice(0, 57) + "…";
  return display;
}

export function ToolCallAccordion({
  pair,
  renderCallContent,
  renderResultContent,
  description,
  apiCall,
}: {
  pair: ToolCallPair;
  renderCallContent: () => React.ReactNode;
  renderResultContent: () => React.ReactNode | null;
  description?: string | null;
  apiCall?: ParsedApiCall | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const { call, result } = pair;

  const isBash = call.name === "Bash";
  const isApi = !!apiCall;
  const toolLabel = isApi ? "api" : isBash ? "bash" : call.name;
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

        {/* API call: method badge + URL */}
        {isApi ? (
          <>
            <span className={cn("inline-flex items-center px-1 py-0 rounded text-[9px] font-mono font-bold border shrink-0", getMethodColor(apiCall.method))}>
              {apiCall.method}
            </span>
            <code className="text-neutral-600 dark:text-neutral-400 truncate min-w-0 text-[11px] font-mono">
              {shortenUrl(apiCall.url)}
            </code>
          </>
        ) : (
          <>
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
          </>
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
          {/* Tool call input / API request */}
          <div className="px-3 py-2">
            <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1">
              {isApi ? "Request" : "Input"}
            </div>
            {renderCallContent()}
          </div>

          {/* Tool result output / API response */}
          {result && (
            <div className="px-3 py-2 border-t border-neutral-200/40 dark:border-neutral-700/30">
              <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1">
                {isApi ? "Response" : "Output"}
              </div>
              {renderResultContent()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
