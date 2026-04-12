const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  todo: { bg: "bg-zinc-600/30", text: "text-zinc-300" },
  in_progress: { bg: "bg-blue-600/30", text: "text-blue-300" },
  in_review: { bg: "bg-purple-600/30", text: "text-purple-300" },
  blocked: { bg: "bg-red-600/30", text: "text-red-300" },
  done: { bg: "bg-green-600/30", text: "text-green-300" },
  cancelled: { bg: "bg-zinc-700/30", text: "text-zinc-400" },
  backlog: { bg: "bg-zinc-700/30", text: "text-zinc-400" },
  // Agent statuses
  idle: { bg: "bg-zinc-600/30", text: "text-zinc-300" },
  running: { bg: "bg-blue-600/30", text: "text-blue-300" },
  paused: { bg: "bg-amber-600/30", text: "text-amber-300" },
  error: { bg: "bg-red-600/30", text: "text-red-300" },
  active: { bg: "bg-green-600/30", text: "text-green-300" },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-600/30", text: "text-red-300" },
  high: { bg: "bg-orange-600/30", text: "text-orange-300" },
  medium: { bg: "bg-blue-600/30", text: "text-blue-300" },
  low: { bg: "bg-zinc-600/30", text: "text-zinc-300" },
};

export function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.todo;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const colors = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      {priority}
    </span>
  );
}
