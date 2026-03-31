import { useState } from "react";
import { cn } from "../lib/utils";

const COLLAPSE_THRESHOLD = 300; // chars
const COLLAPSED_LINES = 6;

export function CollapsibleContent({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = children.length > COLLAPSE_THRESHOLD;

  if (!shouldCollapse) {
    return <span className={className}>{children}</span>;
  }

  if (expanded) {
    return (
      <span className={className}>
        {children}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="block mt-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          Show less
        </button>
      </span>
    );
  }

  const lines = children.split("\n");
  const preview = lines.slice(0, COLLAPSED_LINES).join("\n");

  return (
    <span className={cn(className, "block")}>
      <span
        className="block"
        style={{
          maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
        }}
      >
        {preview}
      </span>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="block mt-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
      >
        Show more ({lines.length - COLLAPSED_LINES} more lines)
      </button>
    </span>
  );
}
