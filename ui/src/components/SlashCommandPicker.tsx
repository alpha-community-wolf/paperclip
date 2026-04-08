import type { Command } from "@paperclipai/shared";
import { cn } from "../lib/utils";

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
  if (commands.length === 0) return null;

  return (
    <div
      className="absolute z-50 min-w-[240px] max-h-[240px] overflow-y-auto rounded-md border border-border bg-popover shadow-md"
      style={{ top: top + 4, left }}
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
    </div>
  );
}
