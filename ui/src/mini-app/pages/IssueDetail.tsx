import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { miniAppApi } from "../api/client";
import { StatusBadge, PriorityBadge } from "../components/StatusBadge";
import { LoadingSpinner } from "../components/LoadingSpinner";

interface IssueDetailProps {
  issueId: string;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  assigneeAgent: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Comment {
  id: string;
  body: string;
  authorAgent: { name: string } | null;
  authorUser: { name: string } | null;
  createdAt: string;
}

const STATUS_OPTIONS = ["todo", "in_progress", "in_review", "blocked", "done"] as const;

export function IssueDetail({ issueId }: IssueDetailProps) {
  const [newComment, setNewComment] = useState("");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const queryClient = useQueryClient();

  const { data: issue, isLoading: loadingIssue } = useQuery({
    queryKey: ["mini-app", "issue", issueId],
    queryFn: () => miniAppApi.get<Issue>(`/issues/${issueId}`),
  });

  const { data: commentsData, isLoading: loadingComments } = useQuery({
    queryKey: ["mini-app", "comments", issueId],
    queryFn: () => miniAppApi.get<{ comments: Comment[] }>(`/issues/${issueId}/comments`),
  });

  const addComment = useMutation({
    mutationFn: (body: string) =>
      miniAppApi.post(`/issues/${issueId}/comments`, { body }),
    onSuccess: () => {
      setNewComment("");
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
      queryClient.invalidateQueries({ queryKey: ["mini-app", "comments", issueId] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      miniAppApi.patch(`/issues/${issueId}`, { status }),
    onSuccess: () => {
      setShowStatusPicker(false);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      queryClient.invalidateQueries({ queryKey: ["mini-app", "issue", issueId] });
    },
  });

  if (loadingIssue) return <LoadingSpinner />;
  if (!issue) return <div className="p-4 text-center text-[var(--tg-theme-hint-color)]">Issue not found</div>;

  const comments = commentsData?.comments ?? (commentsData as unknown as Comment[]) ?? [];

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-[var(--tg-theme-hint-color)]">{issue.identifier}</span>
          <PriorityBadge priority={issue.priority} />
        </div>
        <h1 className="text-lg font-semibold">{issue.title}</h1>
      </div>

      {/* Status + Assignment */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowStatusPicker(!showStatusPicker)}
          className="active:opacity-70"
        >
          <StatusBadge status={issue.status} />
        </button>
        {issue.assigneeAgent && (
          <span className="text-xs text-[var(--tg-theme-hint-color)]">
            → {issue.assigneeAgent.name}
          </span>
        )}
      </div>

      {/* Status picker */}
      {showStatusPicker && (
        <div className="flex gap-1 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => updateStatus.mutate(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                issue.status === s
                  ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]"
                  : "bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-hint-color)]"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      {/* Description */}
      {issue.description && (
        <div className="bg-[var(--tg-theme-secondary-bg-color)] rounded-lg p-3">
          <p className="text-sm whitespace-pre-wrap">{issue.description}</p>
        </div>
      )}

      {/* Comments */}
      <section>
        <h2 className="text-sm font-medium text-[var(--tg-theme-hint-color)] mb-2">
          Comments {!loadingComments && `(${comments.length})`}
        </h2>

        {loadingComments && <LoadingSpinner size="sm" />}

        <div className="space-y-2 mb-3">
          {comments.map((comment) => (
            <div key={comment.id} className="bg-[var(--tg-theme-secondary-bg-color)] rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--tg-theme-button-color)]">
                  {comment.authorAgent?.name ?? comment.authorUser?.name ?? "System"}
                </span>
                <span className="text-[10px] text-[var(--tg-theme-hint-color)]">
                  {formatTime(comment.createdAt)}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
            </div>
          ))}
        </div>

        {/* Add comment */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 bg-[var(--tg-theme-secondary-bg-color)] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[var(--tg-theme-hint-color)]/50 focus:ring-1 focus:ring-[var(--tg-theme-button-color)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newComment.trim()) {
                addComment.mutate(newComment.trim());
              }
            }}
          />
          <button
            onClick={() => {
              if (newComment.trim()) addComment.mutate(newComment.trim());
            }}
            disabled={!newComment.trim() || addComment.isPending}
            className="bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] px-4 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </section>
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}
