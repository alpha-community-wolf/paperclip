import { useMemo } from "react";
import { formatTokens } from "../lib/utils";
import type { TranscriptEntry } from "../adapters";

type ResultEntry = Extract<TranscriptEntry, { kind: "result" }>;

export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalCostUsd: number;
  turnCount: number;
  /** Map from result entry index → cumulative cost at that point */
  resultEntries: ResultEntry[];
}

export function computeCostSummary(entries: TranscriptEntry[]): CostSummary | null {
  const resultEntries: ResultEntry[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let totalCostUsd = 0;

  for (const entry of entries) {
    if (entry.kind === "result") {
      resultEntries.push(entry);
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;
      totalCachedTokens += entry.cachedTokens;
      totalCostUsd += entry.costUsd;
    }
  }

  if (resultEntries.length === 0) return null;

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalCostUsd,
    turnCount: resultEntries.length,
    resultEntries,
  };
}

/**
 * Build a map from entry index → cost attribution.
 * Each result entry's cost is attributed to all entries between
 * the previous result (exclusive) and this result (inclusive).
 * This gives every assistant/tool_call/tool_result in that window
 * a share of the turn's cost.
 */
export function buildCostAttribution(
  entries: TranscriptEntry[],
): Map<number, { costUsd: number; inputTokens: number; outputTokens: number; cachedTokens: number }> {
  const attribution = new Map<number, { costUsd: number; inputTokens: number; outputTokens: number; cachedTokens: number }>();

  let lastResultIdx = -1;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.kind !== "result") continue;

    // Attribute this result's cost to the result entry itself
    // and tag all entries in the window [lastResultIdx+1, i] with the turn cost
    const turnCost = {
      costUsd: entry.costUsd,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cachedTokens: entry.cachedTokens,
    };

    // Tag the result entry
    attribution.set(i, turnCost);

    // Tag preceding entries in this turn window
    for (let j = lastResultIdx + 1; j < i; j++) {
      const e = entries[j];
      // Only tag substantive entries (assistant, tool_call, thinking)
      if (e.kind === "assistant" || e.kind === "tool_call" || e.kind === "thinking") {
        attribution.set(j, turnCost);
      }
    }

    lastResultIdx = i;
  }

  return attribution;
}

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function CostSummaryBar({ summary }: { summary: CostSummary }) {
  const avgCostPerTurn = summary.turnCount > 0 ? summary.totalCostUsd / summary.turnCount : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-900/60 rounded-md border border-neutral-200/60 dark:border-neutral-700/30 text-[11px] font-mono">
      {/* Total cost */}
      <span className="flex items-center gap-1.5">
        <span className="text-neutral-400 dark:text-neutral-500">cost</span>
        <span className="font-medium text-emerald-700 dark:text-emerald-400">
          {formatCost(summary.totalCostUsd)}
        </span>
      </span>

      {/* Token breakdown */}
      <span className="flex items-center gap-1.5">
        <span className="text-neutral-400 dark:text-neutral-500">in</span>
        <span className="text-neutral-700 dark:text-neutral-300">{formatTokens(summary.totalInputTokens)}</span>
      </span>

      <span className="flex items-center gap-1.5">
        <span className="text-neutral-400 dark:text-neutral-500">out</span>
        <span className="text-neutral-700 dark:text-neutral-300">{formatTokens(summary.totalOutputTokens)}</span>
      </span>

      {summary.totalCachedTokens > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="text-neutral-400 dark:text-neutral-500">cached</span>
          <span className="text-neutral-700 dark:text-neutral-300">{formatTokens(summary.totalCachedTokens)}</span>
        </span>
      )}

      {/* Turn count */}
      <span className="flex items-center gap-1.5">
        <span className="text-neutral-400 dark:text-neutral-500">turns</span>
        <span className="text-neutral-700 dark:text-neutral-300">{summary.turnCount}</span>
      </span>

      {/* Avg cost per turn */}
      {summary.turnCount > 1 && (
        <span className="flex items-center gap-1.5">
          <span className="text-neutral-400 dark:text-neutral-500">avg/turn</span>
          <span className="text-neutral-500 dark:text-neutral-400">{formatCost(avgCostPerTurn)}</span>
        </span>
      )}
    </div>
  );
}

/** Inline cost badge shown on individual transcript steps */
export function CostBadge({ costUsd }: { costUsd: number }) {
  if (costUsd <= 0) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-700/30">
      {formatCost(costUsd)}
    </span>
  );
}
