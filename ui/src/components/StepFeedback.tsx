import { useCallback, useMemo } from "react";
import { cn } from "../lib/utils";
import type { StepFeedbackVote, StepFeedbackMap } from "@paperclipai/shared";

// ---------------------------------------------------------------------------
// Inline thumbs up/down buttons — appear on hover, industrial-minimal style
// ---------------------------------------------------------------------------

interface StepFeedbackButtonsProps {
  stepIndex: number;
  feedback: StepFeedbackMap;
  onVote: (stepIndex: number, vote: StepFeedbackVote | null) => void;
}

export function StepFeedbackButtons({ stepIndex, feedback, onVote }: StepFeedbackButtonsProps) {
  const current = feedback[String(stepIndex)] ?? null;

  const handleUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onVote(stepIndex, current === "up" ? null : "up");
    },
    [stepIndex, current, onVote],
  );

  const handleDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onVote(stepIndex, current === "down" ? null : "down");
    },
    [stepIndex, current, onVote],
  );

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 ml-1.5 align-middle",
        // Always visible when voted, otherwise only on group hover
        current ? "opacity-100" : "opacity-0 group-hover/step:opacity-100",
        "transition-opacity duration-100",
      )}
    >
      <button
        type="button"
        onClick={handleUp}
        title="Good step"
        className={cn(
          "inline-flex items-center justify-center w-5 h-5 rounded transition-colors cursor-pointer",
          current === "up"
            ? "bg-emerald-500/20 text-emerald-400"
            : "text-neutral-500 hover:text-emerald-400 hover:bg-emerald-500/10",
        )}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
          <path d="M5 10V6.5C5 5.12 5.5 3 8 3C8 5 8 6 8 6H12C12.55 6 13 6.45 13 7V11C13 11.55 12.55 12 12 12H7.5C6.67 12 6 11.33 6 10.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 6H4C3.45 6 3 6.45 3 7V11C3 11.55 3.45 12 4 12H5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={handleDown}
        title="Bad step"
        className={cn(
          "inline-flex items-center justify-center w-5 h-5 rounded transition-colors cursor-pointer",
          current === "down"
            ? "bg-red-500/20 text-red-400"
            : "text-neutral-500 hover:text-red-400 hover:bg-red-500/10",
        )}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 rotate-180">
          <path d="M5 10V6.5C5 5.12 5.5 3 8 3C8 5 8 6 8 6H12C12.55 6 13 6.45 13 7V11C13 11.55 12.55 12 12 12H7.5C6.67 12 6 11.33 6 10.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 6H4C3.45 6 3 6.45 3 7V11C3 11.55 3.45 12 4 12H5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary bar — compact feedback overview
// ---------------------------------------------------------------------------

interface FeedbackSummaryBarProps {
  feedback: StepFeedbackMap;
  totalSteps: number;
}

export function FeedbackSummaryBar({ feedback, totalSteps }: FeedbackSummaryBarProps) {
  const stats = useMemo(() => {
    const entries = Object.values(feedback);
    const reviewed = entries.length;
    const positive = entries.filter((v) => v === "up").length;
    const negative = entries.filter((v) => v === "down").length;
    return { reviewed, positive, negative };
  }, [feedback]);

  if (stats.reviewed === 0) return null;

  const ratio = stats.reviewed > 0 ? stats.positive / stats.reviewed : 0;

  return (
    <div className="flex items-center gap-3 px-2.5 py-1.5 rounded-md bg-neutral-800/50 border border-neutral-700/30 text-[11px] font-mono">
      <span className="text-neutral-400">
        Reviewed{" "}
        <span className="text-neutral-200 font-medium">
          {stats.reviewed}/{totalSteps}
        </span>
      </span>
      <span className="w-px h-3 bg-neutral-700" />
      <span className="flex items-center gap-1 text-emerald-400">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
          <path d="M5 10V6.5C5 5.12 5.5 3 8 3C8 5 8 6 8 6H12C12.55 6 13 6.45 13 7V11C13 11.55 12.55 12 12 12H7.5C6.67 12 6 11.33 6 10.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 6H4C3.45 6 3 6.45 3 7V11C3 11.55 3.45 12 4 12H5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {stats.positive}
      </span>
      <span className="flex items-center gap-1 text-red-400">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 rotate-180">
          <path d="M5 10V6.5C5 5.12 5.5 3 8 3C8 5 8 6 8 6H12C12.55 6 13 6.45 13 7V11C13 11.55 12.55 12 12 12H7.5C6.67 12 6 11.33 6 10.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 6H4C3.45 6 3 6.45 3 7V11C3 11.55 3.45 12 4 12H5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {stats.negative}
      </span>
      {stats.reviewed >= 2 && (
        <>
          <span className="w-px h-3 bg-neutral-700" />
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 rounded-full bg-neutral-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
            <span className="text-neutral-500 text-[10px]">
              {Math.round(ratio * 100)}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}
