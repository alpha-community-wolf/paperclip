import { useCallback, useRef, useState } from "react";
import type { IssueComment } from "@paperclipai/shared";
import { MessageSquare, Send, X } from "lucide-react";
import { cn } from "../lib/utils";
import { MarkdownBody } from "./MarkdownBody";

/** Metadata shape for transcript-anchored comments */
export interface TranscriptCommentAnchor {
  transcriptAnchor: {
    runId: string;
    entryIndex: number;
    entryTimestamp: string;
    entryKind: string;
  };
}

export function isTranscriptComment(comment: IssueComment): comment is IssueComment & { metadata: TranscriptCommentAnchor } {
  const m = comment.metadata as Record<string, unknown> | null;
  return !!(m && typeof m.transcriptAnchor === "object" && m.transcriptAnchor !== null);
}

export function getCommentEntryIndex(comment: IssueComment): number | null {
  if (!isTranscriptComment(comment)) return null;
  return (comment.metadata as TranscriptCommentAnchor).transcriptAnchor.entryIndex;
}

/** Small button shown on hover to add a comment to a transcript entry */
export function CommentGutterButton({
  commentCount,
  onClick,
  isActive,
}: {
  commentCount: number;
  onClick: () => void;
  isActive: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] transition-all cursor-pointer",
        commentCount > 0
          ? "text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/30"
          : "text-neutral-400 dark:text-neutral-600 opacity-0 group-hover/entry:opacity-100 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30",
        isActive && "opacity-100 text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30",
      )}
      title={commentCount > 0 ? `${commentCount} comment${commentCount !== 1 ? "s" : ""}` : "Add comment"}
    >
      <MessageSquare className="h-2.5 w-2.5" />
      {commentCount > 0 && <span>{commentCount}</span>}
    </button>
  );
}

/** Inline comment thread displayed below a transcript entry */
export function InlineCommentThread({
  comments,
  onAdd,
  onClose,
}: {
  comments: IssueComment[];
  onAdd: (body: string) => Promise<void>;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(trimmed);
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }, [body, submitting, onAdd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        onClose();
      }
    },
    [handleSubmit, onClose],
  );

  return (
    <div className="col-span-full ml-4 mr-2 my-1 rounded-md border border-blue-200/50 dark:border-blue-800/30 bg-blue-50/50 dark:bg-blue-950/20 overflow-hidden">
      {/* Existing comments */}
      {comments.length > 0 && (
        <div className="divide-y divide-blue-100 dark:divide-blue-900/30">
          {comments.map((comment) => (
            <div key={comment.id} className="px-3 py-2 text-[11px]">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-blue-700 dark:text-blue-300">
                  {comment.authorUserId ? "User" : "Agent"}
                </span>
                <span className="text-neutral-400 dark:text-neutral-600">
                  {new Date(comment.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="prose prose-xs dark:prose-invert max-w-none text-neutral-700 dark:text-neutral-300 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <MarkdownBody>{comment.body}</MarkdownBody>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New comment input */}
      <div className="flex items-start gap-2 px-3 py-2 border-t border-blue-100 dark:border-blue-900/30 bg-white/50 dark:bg-neutral-900/50">
        <textarea
          ref={inputRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment on this step..."
          rows={2}
          autoFocus
          className="flex-1 resize-none rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-[11px] text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-400/50 dark:focus:ring-blue-500/50"
        />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!body.trim() || submitting}
            className="rounded p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Submit (Cmd+Enter)"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-neutral-400 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
