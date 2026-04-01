import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "../lib/utils";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusIcon } from "./StatusIcon";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { IssueLinkSummary } from "@paperclipai/shared";

interface DependencyPillsProps {
  issueId: string;
  linkSummary: IssueLinkSummary;
}

export function DependencyPills({ issueId, linkSummary }: DependencyPillsProps) {
  const [open, setOpen] = useState(false);

  const { data: links } = useQuery({
    queryKey: queryKeys.issues.links(issueId),
    queryFn: () => issuesApi.listLinks(issueId),
    enabled: open,
  });

  const { incomingCount, outgoingCount, allUpstreamDone } = linkSummary;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent/50 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {incomingCount > 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded px-1 py-px",
                allUpstreamDone
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
              title={
                allUpstreamDone
                  ? `All ${incomingCount} upstream dependencies done`
                  : `${incomingCount} upstream dependency pending`
              }
            >
              <ArrowUp className="h-2.5 w-2.5" />
              {incomingCount}
            </span>
          )}
          {outgoingCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1 py-px bg-blue-500/10 text-blue-600 dark:text-blue-400"
              title={`Triggers ${outgoingCount} downstream issue${outgoingCount > 1 ? "s" : ""}`}
            >
              <ArrowDown className="h-2.5 w-2.5" />
              {outgoingCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-2"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        {!links ? (
          <div className="text-xs text-muted-foreground py-2 text-center">Loading…</div>
        ) : (
          <div className="space-y-3">
            {links.incoming.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">
                  Blocked by ({links.incoming.length})
                </div>
                <div className="space-y-1">
                  {links.incoming.map((link) => (
                    <a
                      key={link.id}
                      href={`/issues/${link.sourceIdentifier ?? link.sourceId}`}
                      className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/50 transition-colors text-xs no-underline text-inherit"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <StatusIcon status={link.sourceStatus} className="h-3 w-3" />
                      <span className="font-mono text-muted-foreground shrink-0">{link.sourceIdentifier}</span>
                      <span className="truncate">{link.sourceTitle}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {links.outgoing.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">
                  Triggers ({links.outgoing.length})
                </div>
                <div className="space-y-1">
                  {links.outgoing.map((link) => (
                    <a
                      key={link.id}
                      href={`/issues/${link.targetIdentifier ?? link.targetId}`}
                      className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/50 transition-colors text-xs no-underline text-inherit"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <StatusIcon status={link.targetStatus} className="h-3 w-3" />
                      <span className="font-mono text-muted-foreground shrink-0">{link.targetIdentifier}</span>
                      <span className="truncate">{link.targetTitle}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
