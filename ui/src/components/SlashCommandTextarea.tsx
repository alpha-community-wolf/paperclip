import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Command } from "@paperclipai/shared";
import { commandsApi } from "../api/commands";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Textarea } from "@/components/ui/textarea";
import { SlashCommandPicker, calculateSlashPickerPosition } from "./SlashCommandPicker";

interface SlashCommandTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  /** Called when the user presses Enter (without Shift). */
  onSubmit?: () => void;
}

interface SlashDetection {
  query: string;
  slashPos: number;
  top: number;
  left: number;
}

function detectSlashInTextarea(
  textarea: HTMLTextAreaElement,
): SlashDetection | null {
  const { value, selectionStart } = textarea;
  if (selectionStart == null) return null;

  // Walk backwards from cursor to find "/"
  let slashPos = -1;
  for (let i = selectionStart - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "/") {
      if (i === 0 || /\s/.test(value[i - 1])) {
        slashPos = i;
      }
      break;
    }
    if (/\s/.test(ch)) break;
  }

  if (slashPos === -1) return null;

  const query = value.slice(slashPos + 1, selectionStart);
  if (!/^[a-z0-9-]*$/i.test(query)) return null;

  // Approximate caret position using a mirror span
  const rect = textarea.getBoundingClientRect();
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("span");
  mirror.style.position = "fixed";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.font = style.font;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.padding = style.padding;
  mirror.textContent = value.slice(0, slashPos);
  document.body.appendChild(mirror);
  const mirrorRect = mirror.getBoundingClientRect();
  // Use the last line's bottom as approximation
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const lines = mirror.getClientRects();
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : mirrorRect;
  document.body.removeChild(mirror);

  return {
    query,
    slashPos,
    top: rect.top + (lastLine.bottom - mirrorRect.top) + lineHeight - textarea.scrollTop,
    left: rect.left + (lastLine.right - mirrorRect.left),
  };
}

export function SlashCommandTextarea({
  value,
  onChange,
  placeholder,
  rows,
  className,
  disabled,
  onSubmit,
}: SlashCommandTextareaProps) {
  const { selectedCompanyId } = useCompany();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [slash, setSlash] = useState<SlashDetection | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const pickerBusyRef = useRef(false);

  const { data: allCommands } = useQuery({
    queryKey: queryKeys.commands.list(selectedCompanyId ?? "__none__"),
    queryFn: () => commandsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const commands = allCommands ?? [];

  const filtered = useMemo(() => {
    if (!slash) return [];
    const q = slash.query.trim().toLowerCase();
    if (!q) return commands.slice(0, 8);
    return commands
      .filter((c) => c.trigger.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [commands, slash]);

  const active = slash !== null && commands.length > 0 && filtered.length > 0;

  const detect = useCallback(() => {
    if (pickerBusyRef.current) return;
    if (!textareaRef.current || commands.length === 0) {
      setSlash(null);
      return;
    }
    const result = detectSlashInTextarea(textareaRef.current);
    if (result) {
      setSlash(result);
      setSlashIndex(0);
    } else {
      setSlash(null);
    }
  }, [commands.length]);

  // Re-detect on value or cursor change
  useEffect(() => {
    detect();
  }, [value, detect]);

  const insertCommand = useCallback(
    (command: Command) => {
      if (!slash) return;
      const replacement = command.content.endsWith(" ") ? command.content : `${command.content} `;
      const before = value.slice(0, slash.slashPos);
      const cursorPos = textareaRef.current?.selectionStart ?? value.length;
      const after = value.slice(cursorPos);
      const next = before + replacement + after;
      onChange(next);

      // Restore focus and cursor position
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          const pos = before.length + replacement.length;
          ta.setSelectionRange(pos, pos);
        }
      });

      pickerBusyRef.current = false;
      setSlash(null);
    },
    [onChange, slash, value],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (active) {
        if (e.key === "Escape") {
          e.preventDefault();
          setSlash(null);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertCommand(filtered[slashIndex]);
          return;
        }
        if (e.key === " ") {
          setSlash(null);
          // let the space be typed normally
          return;
        }
      }

      // Normal Enter → submit (without shift)
      if (onSubmit && e.key === "Enter" && !e.shiftKey && !active) {
        e.preventDefault();
        onSubmit();
      }
    },
    [active, filtered, insertCommand, onSubmit, slashIndex],
  );

  return (
    <>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={detect}
        placeholder={placeholder}
        rows={rows}
        className={className}
        disabled={disabled}
      />
      {active && slash && (
        <SlashCommandPicker
          commands={filtered}
          index={slashIndex}
          top={slash.top}
          left={slash.left}
          onHover={setSlashIndex}
          onSelect={(command) => {
            pickerBusyRef.current = true;
            insertCommand(command);
          }}
        />
      )}
    </>
  );
}
