export { StatusBadge } from "@/components/StatusBadge";

import { cn } from "@/lib/utils";
import { priorityColor, priorityColorDefault } from "@/lib/status-colors";

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
        priorityColor[priority] ?? priorityColorDefault,
      )}
    >
      {priority}
    </span>
  );
}
