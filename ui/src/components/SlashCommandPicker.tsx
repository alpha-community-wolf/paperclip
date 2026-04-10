import type { Command } from "@paperclipai/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

const VIEWPORT_MARGIN = 8;
const PICKER_OFFSET = 4;
const PICKER_WIDTH = 280;
const PREVIEW_WIDTH = 240;
const PREVIEW_GAP = 4;

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
  /**
   * When true (default), renders via createPortal to document.body with
   * fixed positioning.  When false, renders inline with absolute positioning
   * — coordinates should be relative to the nearest positioned ancestor.
   */
  portal?: boolean;
}

export function SlashCommandPicker({
  commands,
  index,
  top,
  left,
  onHover,
  onSelect,
  portal = true,
}: SlashCommandPickerProps) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const [pickerPos, setPickerPos] = useState({ top, left });
  const [previewSide, setPreviewSide] = useState<"right" | "left">("right");

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    if (portal) {
      const el = pickerRef.current;
      const rect = el?.getBoundingClientRect();
      const menuWidth = rect?.width ?? PICKER_WIDTH;
      const menuHeight = rect?.height ?? 200;

      const pos = calculateSlashPickerPosition({
        anchorTop: top,
        anchorLeft: left,
        menuHeight,
        menuWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });

      setPickerPos(pos);

      const rightSpace = window.innerWidth - (pos.left + PICKER_WIDTH);
      setPreviewSide(rightSpace >= PREVIEW_WIDTH + PREVIEW_GAP + VIEWPORT_MARGIN ? "right" : "left");
    } else {
      // Inline mode: use coordinates as-is (container-relative)
      setPickerPos({ top: top + PICKER_OFFSET, left });

      // For inline, estimate whether preview fits to the right
      const el = pickerRef.current;
      if (el) {
        const pickerRect = el.getBoundingClientRect();
        const rightSpace = window.innerWidth - (pickerRect.right);
        setPreviewSide(rightSpace >= PREVIEW_WIDTH + PREVIEW_GAP + VIEWPORT_MARGIN ? "right" : "left");
      } else {
        setPreviewSide("right");
      }
    }
  }, [top, left, commands.length, portal]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (commands.length === 0) return null;

  const highlighted = commands[index];
  const preview = highlighted?.content?.trim();
  const positionClass = portal ? "fixed" : "absolute";

  const content = (
    <>
      <div
        ref={pickerRef}
        data-slash-command-picker
        className={cn(
          positionClass,
          "z-50 w-[280px] max-h-[200px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1",
        )}
        style={{ top: pickerPos.top, left: pickerPos.left }}
      >
        {commands.map((command, i) => (
          <button
            key={command.id}
            ref={i === index ? activeRef : undefined}
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
        ))}
      </div>
      {preview && (
        <div
          data-slash-command-picker
          className={cn(
            positionClass,
            "z-50 w-[240px] max-h-[200px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg px-3 py-2.5",
          )}
          style={{
            top: pickerPos.top,
            left:
              previewSide === "right"
                ? pickerPos.left + PICKER_WIDTH + PREVIEW_GAP
                : pickerPos.left - PREVIEW_WIDTH - PREVIEW_GAP,
          }}
        >
          <p className="text-[11px] font-medium text-foreground mb-1.5">/{highlighted.trigger}</p>
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{preview}</p>
        </div>
      )}
    </>
  );

  return portal ? createPortal(content, document.body) : content;
}
