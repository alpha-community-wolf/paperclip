import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Bot,
  ShieldCheck,
  Tag,
  TrendingDown,
} from "lucide-react";
import type { SharedMemory } from "../api/memories";
import { memoriesApi } from "../api/memories";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CATEGORY_STYLES: Record<string, { accent: string; bg: string; label: string }> = {
  fact: { accent: "border-l-blue-500", bg: "bg-blue-500/10 text-blue-700 dark:text-blue-300", label: "Fact" },
  decision: { accent: "border-l-amber-500", bg: "bg-amber-500/10 text-amber-700 dark:text-amber-300", label: "Decision" },
  procedure: { accent: "border-l-emerald-500", bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", label: "Procedure" },
  preference: { accent: "border-l-purple-500", bg: "bg-purple-500/10 text-purple-700 dark:text-purple-300", label: "Preference" },
  lesson_learned: { accent: "border-l-rose-500", bg: "bg-rose-500/10 text-rose-700 dark:text-rose-300", label: "Lesson" },
  context: { accent: "border-l-slate-400", bg: "bg-slate-400/10 text-slate-600 dark:text-slate-300", label: "Context" },
};

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  active: { className: "text-emerald-600 dark:text-emerald-400", label: "Active" },
  superseded: { className: "text-muted-foreground line-through", label: "Superseded" },
  disputed: { className: "text-amber-600 dark:text-amber-400", label: "Disputed" },
  archived: { className: "text-muted-foreground/60", label: "Archived" },
};

interface Props {
  memory: SharedMemory;
  agentMap?: Map<string, { name: string }>;
  compact?: boolean;
}

export function MemoryCard({ memory, agentMap, compact }: Props) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const style = CATEGORY_STYLES[memory.category] ?? CATEGORY_STYLES.context!;
  const statusStyle = STATUS_BADGE[memory.status] ?? STATUS_BADGE.active!;

  const archiveMutation = useMutation({
    mutationFn: () => memoriesApi.archive(memory.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories", selectedCompanyId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof memoriesApi.update>[1]) =>
      memoriesApi.update(memory.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories", selectedCompanyId] });
    },
  });

  const sourceAgent = memory.sourceAgentId && agentMap?.get(memory.sourceAgentId);
  const isLong = memory.content.length > 200;
  const displayContent = !expanded && isLong ? memory.content.slice(0, 200) + "..." : memory.content;
  const age = formatAge(memory.createdAt);

  return (
    <div
      className={cn(
        "group relative border border-border/60 rounded-lg border-l-[3px] transition-all hover:border-border hover:shadow-sm",
        style.accent,
        memory.status === "archived" && "opacity-60",
        memory.status === "superseded" && "opacity-50",
        compact ? "p-3" : "p-4",
      )}
    >
      {/* Top row: category badge + status + confidence + actions */}
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", style.bg)}>
          {style.label}
        </span>

        {memory.scope === "company" && (
          <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
            Company
          </span>
        )}

        {memory.status !== "active" && (
          <span className={cn("text-[10px] font-medium flex items-center gap-0.5", statusStyle.className)}>
            {memory.status === "disputed" && <AlertTriangle className="h-3 w-3" />}
            {statusStyle.label}
          </span>
        )}

        {memory.verifiedAt && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-emerald-500">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Verified by another agent</TooltipContent>
          </Tooltip>
        )}

        {/* Confidence bar */}
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      memory.confidence >= 0.7
                        ? "bg-emerald-500"
                        : memory.confidence >= 0.4
                          ? "bg-amber-500"
                          : "bg-rose-500",
                    )}
                    style={{ width: `${Math.round(memory.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(memory.confidence * 100)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Confidence: {Math.round(memory.confidence * 100)}%
              {memory.confidence < 0.3 && " (excluded from injection)"}
            </TooltipContent>
          </Tooltip>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {memory.status === "active" && (
                <DropdownMenuItem onClick={() => archiveMutation.mutate()}>
                  <Archive className="h-3.5 w-3.5 mr-2" />
                  Archive
                </DropdownMenuItem>
              )}
              {memory.status === "archived" && (
                <DropdownMenuItem onClick={() => updateMutation.mutate({ status: "active" })}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                  Restore
                </DropdownMenuItem>
              )}
              {memory.status === "active" && (
                <DropdownMenuItem onClick={() => updateMutation.mutate({ status: "disputed" })}>
                  <AlertTriangle className="h-3.5 w-3.5 mr-2" />
                  Mark Disputed
                </DropdownMenuItem>
              )}
              {memory.confidence > 0 && memory.status === "active" && (
                <DropdownMenuItem onClick={() => updateMutation.mutate({ confidence: Math.max(0, memory.confidence - 0.1) })}>
                  <TrendingDown className="h-3.5 w-3.5 mr-2" />
                  Reduce Confidence
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <p className={cn(
        "text-sm leading-relaxed whitespace-pre-wrap",
        memory.status === "superseded" && "line-through text-muted-foreground",
      )}>
        {displayContent}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary/70 hover:text-primary mt-1 font-medium"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {/* Tags */}
      {memory.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {memory.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer: source + age */}
      {!compact && (
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border/30 text-[11px] text-muted-foreground">
          {sourceAgent && (
            <span className="flex items-center gap-1">
              <Bot className="h-3 w-3" />
              {sourceAgent.name}
            </span>
          )}
          {memory.sourceType === "auto_capture" && (
            <span className="italic">auto-captured</span>
          )}
          {memory.sourceType === "propagated" && (
            <span className="italic">propagated</span>
          )}
          <span className="flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3" />
            {age}
          </span>
          {memory.accessCount > 0 && (
            <span className="tabular-nums">{memory.accessCount} reads</span>
          )}
        </div>
      )}
    </div>
  );
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export { CATEGORY_STYLES };
