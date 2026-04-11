import { useState } from "react";
import { ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useBacklinks } from "@/api/file-index";
import { useCompany } from "@/context/CompanyContext";

interface BacklinksPanelProps {
  /** Relative path of the file being viewed (e.g. "workspace/docs/foo.md") */
  filePath: string;
  className?: string;
}

function agentWorkspaceHref(agentUrlKey: string, relativePath: string): string {
  return `/agents/${encodeURIComponent(agentUrlKey)}/workspace?file=${encodeURIComponent(relativePath)}`;
}

/**
 * Shows all files that link to the currently-viewed file via [[wikilinks]].
 * Renders as a collapsible "Linked from" section below the file content.
 */
export function BacklinksPanel({ filePath, className }: BacklinksPanelProps) {
  const { selectedCompanyId } = useCompany();
  const [expanded, setExpanded] = useState(true);
  const { data: backlinks, isLoading } = useBacklinks(selectedCompanyId, filePath);

  // Don't render if loading took too long (server error etc.) — just hide gracefully
  if (!isLoading && (!backlinks || backlinks.length === 0)) {
    return (
      <div className={cn("mt-4", className)}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">Linked from</span>
          <span className="ml-1 text-muted-foreground/60">(0)</span>
        </button>
        {expanded && (
          <p className="text-xs text-muted-foreground/60 pl-7 pb-2">
            No files link to this file yet.
          </p>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn("mt-4", className)}>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">Linked from</span>
          <span className="ml-2 h-3 w-12 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mt-4 border-t border-border pt-3", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <Link2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-foreground">Linked from</span>
        <span className="ml-1 bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
          {backlinks!.length}
        </span>
      </button>

      {expanded && (
        <ul className="mt-1 space-y-2 pl-1">
          {backlinks!.map((entry, idx) => (
            <li
              key={idx}
              className="rounded-md border border-border bg-muted/20 px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/70 shrink-0">
                  {entry.sourceAgentName}
                </span>
                <Link
                  to={agentWorkspaceHref(entry.sourceAgentUrlKey, entry.sourceRelativePath)}
                  className="text-xs font-mono text-primary hover:underline truncate"
                  title={entry.sourceRelativePath}
                >
                  {entry.sourceRelativePath.split("/").pop() ?? entry.sourceRelativePath}
                </Link>
              </div>
              {entry.contextSnippet && (
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {entry.contextSnippet}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
