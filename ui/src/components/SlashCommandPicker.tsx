import type { Command } from "@paperclipai/shared";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

const VIEWPORT_MARGIN = 8;
const PICKER_OFFSET = 4;

interface SlashPickerPositionInput {
  anchorTop: number;
  anchorLeft: number;
  menuHeight: number;
  menuWidth: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function calculateSlashPickerPosition({
  anchorTop,
  anchorLeft,
  menuHeight,
  menuWidth,
  viewportWidth,
  viewportHeight,
}: SlashPickerPositionInput): { top: number; left: number } {
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - menuWidth - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(anchorLeft, VIEWPORT_MARGIN), maxLeft);

  const belowTop = anchorTop + PICKER_OFFSET;
  const overflowsBelow = belowTop + menuHeight > viewportHeight - VIEWPORT_MARGIN;
  const aboveTop = anchorTop - menuHeight - PICKER_OFFSET;
  const top = overflowsBelow ? Math.max(VIEWPORT_MARGIN, aboveTop) : belowTop;

  return { top, left };
}

interface SlashCommandPickerProps {
  commands: Command[];
  index: number;
  top: number;
  left: number;
  onHover: (index: number) => void;
  onSelect: (command: Command) => void;
}

export function SlashCommandPicker({
  commands,
  index,
  top,
  left,
  onHover,
  onSelect,
}: SlashCommandPickerProps) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [pickerPos, setPickerPos] = useState({ top, left });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const el = pickerRef.current;
    const rect = el?.getBoundingClientRect();
    const menuWidth = rect?.width ?? 280;
    const menuHeight = rect?.height ?? 200;

    setPickerPos(
      calculateSlashPickerPosition({
        anchorTop: top,
        anchorLeft: left,
        menuHeight,
        menuWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
  }, [top, left, commands.length]);

  if (commands.length === 0) return null;

  const showPreview = hoveredIndex !== null && commands[hoveredIndex];

  return createPortal(
    <div className="fixed z-50 flex items-start gap-1.5" style={{ top: pickerPos.top, left: pickerPos.left }}>
      {/* Command list */}
      <div
        ref={pickerRef}
        className="w-[280px] max-h-[200px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1"
      >
        {commands.map((command, i) => (
          <button
            key={command.id}
            className={cn(
              "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent/50",
              i === index && "bg-accent",
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(command);
            }}
            onMouseEnter={() => {
              onHover(i);
              setHoveredIndex(i);
            }}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <span className="font-medium text-foreground truncate">/{command.trigger}</span>
            <span className="truncate text-xs text-muted-foreground">{command.label}</span>
          </button>
        ))}
      </div>

      {/* Hover preview tooltip */}
      {showPreview && (
        <div className="w-[240px] rounded-lg border border-border bg-popover shadow-lg p-3 text-[13px] text-foreground/90 leading-relaxed">
          <p className="font-medium text-foreground mb-1">/{commands[hoveredIndex!].trigger}</p>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words line-clamp-6">
            {commands[hoveredIndex!].content}
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}
