import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Link } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useWikiLinkResolve } from "@/api/file-index";

interface WikiLinkProps {
  /** The wikilink target as emitted by remark-wiki-link (filename or scope/filename) */
  href: string;
  /** Display text (alias or original filename) */
  children: ReactNode;
  className?: string;
}

function workspaceFileHref(agentUrlKey: string, relativePath: string): string {
  return `/agents/${encodeURIComponent(agentUrlKey)}/workspace?file=${encodeURIComponent(relativePath)}`;
}

/**
 * Renders a [[wikilink]] with resolution against the server-side file index.
 *
 * Resolved links: solid underline, clickable, navigates to workspace file viewer.
 * Unresolved links: dashed underline, non-navigable, tooltip "File not found".
 * Loading (initial): same as unresolved (no layout shift).
 *
 * The href from remark-wiki-link is either:
 *   - "filename"          (obsidian-short: bare filename match)
 *   - "agent/filename"    (scoped: match within a specific agent's workspace)
 */
export function WikiLink({ href, children, className }: WikiLinkProps) {
  const { selectedCompanyId } = useCompany();

  // Parse optional scope prefix: "corey/proof-points" → scope="corey", name="proof-points"
  const slashIdx = href.lastIndexOf("/");
  const scope = slashIdx > 0 ? href.slice(0, slashIdx) : undefined;
  const name = slashIdx > 0 ? href.slice(slashIdx + 1) : href;

  const { data, isLoading } = useWikiLinkResolve(selectedCompanyId, name, scope);

  const isResolved = !isLoading && data?.resolved === true;
  const isAmbiguous = !isLoading && data?.resolved === false && (data.candidates?.length ?? 0) > 1;
  const resolvedFile = isResolved ? data : null;

  const tooltipText = isLoading
    ? `[[${href}]]`
    : isResolved
      ? `${resolvedFile!.agentName}: ${resolvedFile!.relativePath}`
      : isAmbiguous
        ? `Ambiguous: ${(data as { candidates: Array<{ agentName: string }> }).candidates.map((c) => c.agentName).join(", ")}`
        : `[[${href}]] — File not found`;

  if (isResolved && resolvedFile) {
    return (
      <Link
        to={workspaceFileHref(resolvedFile.agentUrlKey, resolvedFile.relativePath)}
        className={cn(
          "outpost-wikilink outpost-wikilink--resolved",
          "border-b border-solid border-primary text-primary",
          "hover:border-primary/60 hover:text-primary/80 transition-colors no-underline",
          className,
        )}
        title={tooltipText}
        data-wikilink={href}
        data-wikilink-agent={resolvedFile.agentUrlKey}
      >
        {children}
      </Link>
    );
  }

  return (
    <span
      className={cn(
        "outpost-wikilink",
        isAmbiguous
          ? "border-b border-dashed border-yellow-500/70 text-yellow-600 dark:text-yellow-400"
          : "border-b border-dashed border-primary/60 text-primary/90",
        "cursor-default select-text transition-colors",
        className,
      )}
      title={tooltipText}
      data-wikilink={href}
    >
      {children}
    </span>
  );
}
