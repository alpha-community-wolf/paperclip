import { useMemo, useState } from "react";
import { cn } from "../lib/utils";
import type { TranscriptEntry } from "../adapters";

// ---------------------------------------------------------------------------
// Step types and computation
// ---------------------------------------------------------------------------

export type StepType = "init" | "assistant" | "thinking" | "tool" | "result" | "user" | "system";

export interface TimelineStep {
  /** 1-based step number */
  number: number;
  type: StepType;
  /** Index range [startIdx, endIdx) into the entries array */
  startIdx: number;
  endIdx: number;
  /** Timestamp of the first entry in this step */
  startTs: string;
  /** Timestamp of the last entry in this step */
  endTs: string;
}

function entryToStepType(kind: TranscriptEntry["kind"]): StepType {
  switch (kind) {
    case "init": return "init";
    case "assistant": return "assistant";
    case "thinking": return "thinking";
    case "tool_call":
    case "tool_result": return "tool";
    case "result": return "result";
    case "user": return "user";
    case "stderr":
    case "stdout":
    case "system": return "system";
    default: return "system";
  }
}

/**
 * Group transcript entries into logical timeline steps.
 * Consecutive entries of the same step type are merged into one step.
 */
export function useTimelineSteps(entries: TranscriptEntry[]): TimelineStep[] {
  return useMemo(() => {
    if (entries.length === 0) return [];

    const steps: TimelineStep[] = [];
    let currentType = entryToStepType(entries[0].kind);
    let startIdx = 0;
    let stepNum = 1;

    for (let i = 1; i <= entries.length; i++) {
      const nextType = i < entries.length ? entryToStepType(entries[i].kind) : null;

      if (nextType !== currentType) {
        steps.push({
          number: stepNum++,
          type: currentType,
          startIdx,
          endIdx: i,
          startTs: entries[startIdx].ts,
          endTs: entries[i - 1].ts,
        });
        if (nextType !== null) {
          currentType = nextType;
          startIdx = i;
        }
      }
    }

    return steps;
  }, [entries]);
}

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remainSec = Math.round(sec % 60);
  return `${min}m ${remainSec}s`;
}

function getDurationBetween(ts1: string, ts2: string): string {
  const d1 = new Date(ts1).getTime();
  const d2 = new Date(ts2).getTime();
  return formatDuration(Math.abs(d2 - d1));
}

// ---------------------------------------------------------------------------
// Step type icons (inline SVG)
// ---------------------------------------------------------------------------

const STEP_ICONS: Record<StepType, React.ReactNode> = {
  init: (
    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
      <path d="M8 2L14 8L8 14L2 8L8 2Z" fill="currentColor" opacity="0.9" />
    </svg>
  ),
  assistant: (
    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
      <circle cx="8" cy="6" r="3" fill="currentColor" />
      <path d="M3 14C3 11.24 5.24 9 8 9C10.76 9 13 11.24 13 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  thinking: (
    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
      <circle cx="8" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="5" cy="7" r="0.8" fill="currentColor" />
      <circle cx="8" cy="7" r="0.8" fill="currentColor" />
      <circle cx="11" cy="7" r="0.8" fill="currentColor" />
    </svg>
  ),
  tool: (
    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
      <path d="M10.5 2.5L13.5 5.5L6 13L2 14L3 10L10.5 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  result: (
    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M5.5 8L7.5 10L11 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
      <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M6 8H10M8 6V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
      <rect x="3" y="5" width="10" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M5 8H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
};

const STEP_COLORS: Record<StepType, string> = {
  init: "text-blue-500 dark:text-blue-400",
  assistant: "text-green-600 dark:text-green-400",
  thinking: "text-violet-500 dark:text-violet-400",
  tool: "text-yellow-600 dark:text-yellow-400",
  result: "text-cyan-600 dark:text-cyan-400",
  user: "text-neutral-500 dark:text-neutral-400",
  system: "text-neutral-400 dark:text-neutral-500",
};

const STEP_BG: Record<StepType, string> = {
  init: "bg-blue-500/15 dark:bg-blue-400/15 border-blue-400/30 dark:border-blue-400/20",
  assistant: "bg-green-500/15 dark:bg-green-400/15 border-green-400/30 dark:border-green-400/20",
  thinking: "bg-violet-500/15 dark:bg-violet-400/15 border-violet-400/30 dark:border-violet-400/20",
  tool: "bg-yellow-500/15 dark:bg-yellow-400/15 border-yellow-400/30 dark:border-yellow-400/20",
  result: "bg-cyan-500/15 dark:bg-cyan-400/15 border-cyan-400/30 dark:border-cyan-400/20",
  user: "bg-neutral-500/15 dark:bg-neutral-400/15 border-neutral-400/30 dark:border-neutral-400/20",
  system: "bg-neutral-400/10 dark:bg-neutral-500/10 border-neutral-300/30 dark:border-neutral-600/20",
};

const STEP_LINE: Record<StepType, string> = {
  init: "bg-blue-400/30 dark:bg-blue-400/20",
  assistant: "bg-green-400/30 dark:bg-green-400/20",
  thinking: "bg-violet-400/30 dark:bg-violet-400/20",
  tool: "bg-yellow-400/30 dark:bg-yellow-400/20",
  result: "bg-cyan-400/30 dark:bg-cyan-400/20",
  user: "bg-neutral-400/30 dark:bg-neutral-400/20",
  system: "bg-neutral-300/20 dark:bg-neutral-600/15",
};

// ---------------------------------------------------------------------------
// Duration badge (shown between steps on hover)
// ---------------------------------------------------------------------------

function DurationBadge({ fromTs, toTs }: { fromTs: string; toTs: string }) {
  const dur = getDurationBetween(fromTs, toTs);
  return (
    <span className="text-[9px] text-neutral-400 dark:text-neutral-500 tabular-nums px-1.5 py-0 rounded-full bg-neutral-200/50 dark:bg-neutral-800/50 border border-neutral-200/50 dark:border-neutral-700/30 select-none whitespace-nowrap">
      {dur}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Timeline marker
// ---------------------------------------------------------------------------

function TimelineMarker({
  step,
  isLast,
  nextStep,
}: {
  step: TimelineStep;
  isLast: boolean;
  nextStep: TimelineStep | null;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="flex flex-col items-center w-7 shrink-0 select-none">
      {/* Step marker: icon in circle */}
      <div
        className={cn(
          "relative flex items-center justify-center w-5 h-5 rounded-full border shrink-0 cursor-default transition-transform",
          STEP_BG[step.type],
          STEP_COLORS[step.type],
          hovered && "scale-110",
        )}
        title={`Step ${step.number} · ${step.type}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {STEP_ICONS[step.type]}
      </div>

      {/* Connecting line + optional duration badge */}
      {!isLast && (
        <div className="flex flex-col items-center flex-1 min-h-[4px] py-0.5">
          <div className={cn("w-px flex-1 min-h-[4px]", STEP_LINE[step.type])} />
          {hovered && nextStep && (
            <div className="py-0.5">
              <DurationBadge fromTs={step.endTs} toTs={nextStep.startTs} />
            </div>
          )}
          <div className={cn("w-px flex-1 min-h-[4px]", nextStep ? STEP_LINE[nextStep.type] : STEP_LINE[step.type])} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public: TimelineWrapper
// ---------------------------------------------------------------------------

/**
 * Wraps transcript entries with a timeline rail on the left.
 * `renderEntries(startIdx, endIdx)` should render the entries in the given range.
 */
export function TimelineWrapper({
  steps,
  renderEntries,
}: {
  steps: TimelineStep[];
  renderEntries: (startIdx: number, endIdx: number) => React.ReactNode;
}) {
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const nextStep = isLast ? null : steps[i + 1];

        return (
          <div key={`step-${step.number}`} className="flex items-stretch gap-0">
            {/* Timeline rail */}
            <TimelineMarker step={step} isLast={isLast} nextStep={nextStep} />

            {/* Step number */}
            <div className="flex items-start pt-0.5">
              <span className={cn(
                "text-[9px] tabular-nums font-mono select-none w-4 text-right shrink-0",
                STEP_COLORS[step.type],
              )}>
                {step.number}
              </span>
            </div>

            {/* Entries for this step */}
            <div className="flex-1 min-w-0 pl-1">
              {renderEntries(step.startIdx, step.endIdx)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
