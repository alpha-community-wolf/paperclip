import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { miniAppApi } from "../api/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface QuickCreateProps {
  companyId: string;
  onCreated: (issueId: string) => void;
}

interface Agent {
  id: string;
  name: string;
  title: string | null;
  status: string;
}

const PRIORITIES = ["critical", "high", "medium", "low"] as const;

export function QuickCreate({ companyId, onCreated }: QuickCreateProps) {
  const [title, setTitle] = useState("");
  const [assigneeAgentId, setAssigneeAgentId] = useState<string>("__none__");
  const [priority, setPriority] = useState<string>("medium");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const { data: agentsData } = useQuery({
    queryKey: ["mini-app", "agents", companyId],
    queryFn: () => miniAppApi.get<{ agents: Agent[] }>(`/companies/${companyId}/agents`),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      miniAppApi.post<{ id: string; identifier: string }>(`/companies/${companyId}/issues`, body),
    onSuccess: (data) => {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      queryClient.invalidateQueries({ queryKey: ["mini-app"] });
      onCreated(data.id);
    },
  });

  // MainButton integration
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    const mb = tg.MainButton;
    mb.setText("Create Issue");
    mb.show();

    const handler = () => {
      if (!title.trim()) {
        tg.HapticFeedback.notificationOccurred("error");
        return;
      }
      createMutation.mutate({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigneeAgentId: assigneeAgentId === "__none__" ? undefined : assigneeAgentId,
        status: "todo",
      });
    };

    mb.onClick(handler);

    return () => {
      mb.offClick(handler);
      mb.hide();
    };
  }, [title, description, priority, assigneeAgentId]);

  const agents = (agentsData?.agents ?? (agentsData as unknown as Agent[]) ?? [])
    .filter((a) => a.status !== "terminated");

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Quick Create</h1>

      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="issue-title">Title *</Label>
        <Input
          id="issue-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          autoFocus
        />
      </div>

      {/* Assignee */}
      <div className="space-y-1.5">
        <Label>Assignee</Label>
        <Select value={assigneeAgentId} onValueChange={setAssigneeAgentId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unassigned</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}{agent.title ? ` — ${agent.title}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priority */}
      <div className="space-y-1.5">
        <Label>Priority</Label>
        <div className="flex gap-1.5">
          {PRIORITIES.map((p) => (
            <Button
              key={p}
              variant={priority === p ? "default" : "secondary"}
              size="sm"
              className={cn("flex-1 capitalize")}
              onClick={() => setPriority(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="issue-desc">Description</Label>
        <Textarea
          id="issue-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional details..."
          rows={3}
        />
      </div>

      {/* Fallback create button for non-Telegram contexts */}
      {!window.Telegram?.WebApp && (
        <Button
          className="w-full"
          onClick={() => {
            if (!title.trim()) return;
            createMutation.mutate({
              title: title.trim(),
              description: description.trim() || undefined,
              priority,
              assigneeAgentId: assigneeAgentId === "__none__" ? undefined : assigneeAgentId,
              status: "todo",
            });
          }}
          disabled={!title.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? "Creating..." : "Create Issue"}
        </Button>
      )}

      {createMutation.isError && (
        <p className="text-destructive text-sm text-center">
          {(createMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
