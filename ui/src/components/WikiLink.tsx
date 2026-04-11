import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface WikiLinkProps {
  /** The wikilink target (filename without extension) */
  href: string;
  /** Display text (alias or filename) */
  children: ReactNode;
  className?: string;
}

/**
 * Renders a [[wikilink]] as a styled span.
 *
 * Phase 1: always unresolved styling (dashed underline).
 * Phase 2 will add file resolution and navigation.
 */
export function WikiLink({ href: _href, children, className }: WikiLinkProps) {
  return (
    <span
      className={cn(
        "outpost-wikilink",
        "border-b border-dashed border-primary/60 text-primary/90",
        "cursor-default select-text hover:border-primary hover:text-primary transition-colors",
        "font-[inherit]",
        className,
      )}
      title={`[[${_href}]]`}
      data-wikilink={_href}
    >
      {children}
    </span>
  );
}
