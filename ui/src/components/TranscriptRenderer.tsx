import { cn, formatTokens } from "../lib/utils";
import type { TranscriptEntry } from "../adapters";

const GRID = "grid grid-cols-[auto_auto_1fr] gap-x-2 sm:gap-x-3 items-baseline";
const TS_CELL = "text-neutral-400 dark:text-neutral-600 select-none w-12 sm:w-16 text-[10px] sm:text-xs tabular-nums";
const LBL_CELL = "w-14 sm:w-20 text-[10px] sm:text-xs";
const CONTENT_CELL = "min-w-0 whitespace-pre-wrap break-words overflow-hidden";
const EXPAND_CELL = "col-span-full md:col-start-3 md:col-span-1";

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

export function TranscriptRenderer({
  entries,
  compact = false,
}: {
  entries: TranscriptEntry[];
  compact?: boolean;
}) {
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
              <span className={cn(CONTENT_CELL, "text-green-900 dark:text-green-100")}>{entry.text}</span>
            </div>
          );
        }

        if (entry.kind === "thinking") {
          return (
            <div key={`${entry.ts}-thinking-${idx}`} className={cn(GRID, "py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-green-600/60 dark:text-green-300/60")}>thinking</span>
              <span className={cn(CONTENT_CELL, "text-green-800/60 dark:text-green-100/60 italic")}>{entry.text}</span>
            </div>
          );
        }

        if (entry.kind === "user") {
          return (
            <div key={`${entry.ts}-user-${idx}`} className={cn(GRID, "py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-neutral-500 dark:text-neutral-400")}>user</span>
              <span className={cn(CONTENT_CELL, "text-neutral-700 dark:text-neutral-300")}>{entry.text}</span>
            </div>
          );
        }

        if (entry.kind === "tool_call") {
          if (compact) {
            return (
              <div key={`${entry.ts}-tool-${idx}`} className={cn(GRID, "py-0.5")}>
                <span className={TS_CELL}>{time}</span>
                <span className={cn(LBL_CELL, "text-yellow-700 dark:text-yellow-300")}>tool</span>
                <span className="text-yellow-900 dark:text-yellow-100 min-w-0 truncate">{entry.name}</span>
              </div>
            );
          }
          return (
            <div key={`${entry.ts}-tool-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, "text-yellow-700 dark:text-yellow-300")}>tool_call</span>
              <span className="text-yellow-900 dark:text-yellow-100 min-w-0">{entry.name}</span>
              <pre className={cn(EXPAND_CELL, "bg-neutral-200 dark:bg-neutral-900 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap text-neutral-800 dark:text-neutral-200")}>
                {JSON.stringify(entry.input, null, 2)}
              </pre>
            </div>
          );
        }

        if (entry.kind === "tool_result") {
          if (compact) {
            return (
              <div key={`${entry.ts}-toolres-${idx}`} className={cn(GRID, "py-0.5")}>
                <span className={TS_CELL}>{time}</span>
                <span className={cn(LBL_CELL, entry.isError ? "text-red-600 dark:text-red-300" : "text-purple-600 dark:text-purple-300")}>result</span>
                <span className={cn(CONTENT_CELL, entry.isError ? "text-red-600 dark:text-red-400" : "text-neutral-500", "truncate")}>
                  {entry.isError ? "error" : entry.content.slice(0, 80)}
                </span>
              </div>
            );
          }
          return (
            <div key={`${entry.ts}-toolres-${idx}`} className={cn(GRID, "gap-y-1 py-0.5")}>
              <span className={TS_CELL}>{time}</span>
              <span className={cn(LBL_CELL, entry.isError ? "text-red-600 dark:text-red-300" : "text-purple-600 dark:text-purple-300")}>tool_result</span>
              {entry.isError ? <span className="text-red-600 dark:text-red-400 min-w-0">error</span> : <span />}
              <pre className={cn(EXPAND_CELL, "bg-neutral-100 dark:bg-neutral-900 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap text-neutral-700 dark:text-neutral-300 max-h-60 overflow-y-auto")}>
                {(() => { try { return JSON.stringify(JSON.parse(entry.content), null, 2); } catch { return entry.content; } })()}
              </pre>
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

        const label =
          entry.kind === "stderr" ? "stderr" :
          entry.kind === "system" ? "system" :
          "stdout";
        const color =
          entry.kind === "stderr" ? "text-red-600 dark:text-red-300" :
          entry.kind === "system" ? "text-blue-600 dark:text-blue-300" :
          "text-neutral-500";
        return (
          <div key={`${entry.ts}-raw-${idx}`} className={GRID}>
            <span className={TS_CELL}>{time}</span>
            <span className={cn(LBL_CELL, color)}>{label}</span>
            <span className={cn(CONTENT_CELL, color)}>{entry.text}</span>
          </div>
        );
      })}
    </>
  );
}
