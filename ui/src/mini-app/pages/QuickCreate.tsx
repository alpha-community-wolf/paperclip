import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { miniAppApi } from "../api/client";

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
  const [assigneeAgentId, setAssigneeAgentId] = useState<string>("");
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
      // Haptic feedback
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
        assigneeAgentId: assigneeAgentId || undefined,
        status: "todo",
      });
    };

    mb.onClick(handler);

    return () => {
      mb.offClick(handler);
      mb.hide();
    };
  }, [title, description, priority, assigneeAgentId]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Quick Create</h1>

      {/* Title */}
      <div>
        <label className="block text-xs text-[var(--tg-theme-hint-color)] mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="w-full bg-[var(--tg-theme-secondary-bg-color)] rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-[var(--tg-theme-hint-color)]/50 focus:ring-1 focus:ring-[var(--tg-theme-button-color)]"
          autoFocus
        />
      </div>

      {/* Assignee */}
      <div>
        <label className="block text-xs text-[var(--tg-theme-hint-color)] mb-1">Assignee</label>
        <select
          value={assigneeAgentId}
          onChange={(e) => setAssigneeAgentId(e.target.value)}
          className="w-full bg-[var(--tg-theme-secondary-bg-color)] rounded-lg px-3 py-2.5 text-sm outline-none"
        >
          <option value="">Unassigned</option>
          {(agentsData?.agents ?? [])
            .filter((a) => a.status !== "terminated")
            .map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}{agent.title ? ` — ${agent.title}` : ""}
              </option>
            ))}
        </select>
      </div>

      {/* Priority */}
      <div>
        <label className="block text-xs text-[var(--tg-theme-hint-color)] mb-1">Priority</label>
        <div className="flex gap-1.5">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                priority === p
                  ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]"
                  : "bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-hint-color)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-[var(--tg-theme-hint-color)] mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional details..."
          rows={3}
          className="w-full bg-[var(--tg-theme-secondary-bg-color)] rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-[var(--tg-theme-hint-color)]/50 resize-none focus:ring-1 focus:ring-[var(--tg-theme-button-color)]"
        />
      </div>

      {/* Fallback create button for non-Telegram contexts */}
      {!window.Telegram?.WebApp && (
        <button
          onClick={() => {
            if (!title.trim()) return;
            createMutation.mutate({
              title: title.trim(),
              description: description.trim() || undefined,
              priority,
              assigneeAgentId: assigneeAgentId || undefined,
              status: "todo",
            });
          }}
          disabled={!title.trim() || createMutation.isPending}
          className="w-full bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] rounded-lg py-3 text-sm font-medium disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating..." : "Create Issue"}
        </button>
      )}

      {createMutation.isError && (
        <p className="text-red-400 text-sm text-center">
          {(createMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
