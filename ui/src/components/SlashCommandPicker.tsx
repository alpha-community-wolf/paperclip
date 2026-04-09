import type { Command } from "@paperclipai/shared";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  /** While true, parent skips slash detection so selectionchange from clicking does not clear state before insert. */
  onPickerInteractionLockChange?: (locked: boolean) => void;
}

export function SlashCommandPicker({
  commands,
  index,
  top,
  left,
  onHover,
  onSelect,
  onPickerInteractionLockChange,
}: SlashCommandPickerProps) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [pickerPos, setPickerPos] = useState({ top, left });

  const armInteractionUnlock = () => {
    const unlock = () => {
      onPickerInteractionLockChange?.(false);
      window.removeEventListener("pointerup", unlock);
      window.removeEventListener("pointercancel", unlock);
    };
    window.addEventListener("pointerup", unlock);
    window.addEventListener("pointercancel", unlock);
  };

  const handlePickerPointerDownCapture = () => {
    onPickerInteractionLockChange?.(true);
    armInteractionUnlock();
  };

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

  return createPortal(
    <div
      ref={pickerRef}
      data-slash-command-picker
      className="fixed z-50 w-[280px] max-h-[200px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1"
      style={{ top: pickerPos.top, left: pickerPos.left }}
      onPointerDownCapture={handlePickerPointerDownCapture}
    >
      {commands.map((command, i) => {
        const rowButton = (
          <button
            type="button"
            className={cn(
              "flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent/50",
              i === index && "bg-accent",
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(command);
            }}
            onMouseEnter={() => onHover(i)}
          >
            <span className="shrink-0 font-medium text-foreground">/{command.trigger}</span>
            <span className="min-w-0 truncate text-xs text-muted-foreground leading-5">
              {command.label}
            </span>
          </button>
        );

        const preview = command.content?.trim();
        if (!preview) {
          return <Fragment key={command.id}>{rowButton}</Fragment>;
        }

        return (
          <Tooltip key={command.id} delayDuration={400}>
            <TooltipTrigger asChild>{rowButton}</TooltipTrigger>
            <TooltipContent
              side="right"
              align="start"
              sideOffset={8}
              className="max-w-sm max-h-48 overflow-y-auto px-3 py-2 text-left text-xs font-normal"
            >
              <p className="whitespace-pre-wrap text-balance">{preview}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>,
    document.body,
  );
}
