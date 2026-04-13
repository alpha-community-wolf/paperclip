import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { miniAppApi } from "../api/client";
import { StatusBadge, PriorityBadge } from "../components/StatusBadge";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/utils";

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
  if (!issue) return <div className="p-4 text-center text-muted-foreground">Issue not found</div>;

  const comments = commentsData?.comments ?? (commentsData as unknown as Comment[]) ?? [];

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-muted-foreground">{issue.identifier}</span>
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
          <span className="text-xs text-muted-foreground">
            {issue.assigneeAgent.name}
          </span>
        )}
      </div>

      {/* Status picker */}
      {showStatusPicker && (
        <div className="flex gap-1 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <Button
              key={s}
              variant={issue.status === s ? "default" : "secondary"}
              size="xs"
              className="rounded-full"
              onClick={() => updateStatus.mutate(s)}
            >
              {s.replace(/_/g, " ")}
            </Button>
          ))}
        </div>
      )}

      {/* Description */}
      {issue.description && (
        <Card className="py-3 gap-0">
          <CardContent className="px-3 py-0">
            <p className="text-sm whitespace-pre-wrap">{issue.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Comments */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">
          Comments {!loadingComments && `(${comments.length})`}
        </h2>

        {loadingComments && <LoadingSpinner size="sm" />}

        <div className="space-y-2 mb-3">
          {comments.map((comment) => (
            <Card key={comment.id} className="py-3 gap-0">
              <CardContent className="px-3 py-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-primary">
                    {comment.authorAgent?.name ?? comment.authorUser?.name ?? "System"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {relativeTime(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add comment */}
        <div className="flex gap-2">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && newComment.trim()) {
                addComment.mutate(newComment.trim());
              }
            }}
          />
          <Button
            size="icon"
            onClick={() => {
              if (newComment.trim()) addComment.mutate(newComment.trim());
            }}
            disabled={!newComment.trim() || addComment.isPending}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
