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

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const el = pickerRef.current;
    const rect = el?.getBoundingClientRect();
    const menuWidth = rect?.width ?? 260;
    const menuHeight = rect?.height ?? 240;

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

  return createPortal(
    <div
      ref={pickerRef}
      className="fixed z-50 min-w-[240px] max-h-[240px] overflow-y-auto rounded-md border border-border bg-popover shadow-md"
      style={{ top: pickerPos.top, left: pickerPos.left }}
    >
      {commands.map((command, i) => (
        <button
          key={command.id}
          className={cn(
            "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50",
            i === index && "bg-accent",
          )}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(command);
          }}
          onMouseEnter={() => onHover(i)}
        >
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            /{command.trigger}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-foreground">{command.label}</span>
            <span className="block truncate text-xs text-muted-foreground">{command.content}</span>
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
