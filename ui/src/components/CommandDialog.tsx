import { useEffect, useMemo, useState } from "react";
import type { Command, CreateCommand, UpdateCommand } from "@paperclipai/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CommandDraft = Pick<CreateCommand, "trigger" | "label" | "content">;

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  command?: Command | null;
  existingTriggers: string[];
  onSubmit: (data: CommandDraft | UpdateCommand) => Promise<void>;
  isPending?: boolean;
  error?: string | null;
}

const TRIGGER_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function normalizeTrigger(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\/+/, "");
}

export function CommandDialog({
  open,
  onOpenChange,
  command,
  existingTriggers,
  onSubmit,
  isPending = false,
  error,
}: CommandDialogProps) {
  const isEdit = Boolean(command);
  const [trigger, setTrigger] = useState("");
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTrigger(command?.trigger ?? "");
    setLabel(command?.label ?? "");
    setContent(command?.content ?? "");
    setLocalError(null);
  }, [open, command]);

  const duplicateSet = useMemo(() => {
    const current = command?.trigger ?? "";
    return new Set(existingTriggers.filter((item) => item !== current));
  }, [existingTriggers, command?.trigger]);

  async function handleSubmit() {
    const normalizedTrigger = normalizeTrigger(trigger);
    const normalizedLabel = label.trim();
    const normalizedContent = content;

    if (!TRIGGER_PATTERN.test(normalizedTrigger)) {
      setLocalError("Trigger must use lowercase letters, numbers, and hyphens.");
      return;
    }
    if (!normalizedLabel) {
      setLocalError("Label is required.");
      return;
    }
    if (!normalizedContent.trim()) {
      setLocalError("Content is required.");
      return;
    }
    if (duplicateSet.has(normalizedTrigger)) {
      setLocalError(`/${normalizedTrigger} already exists.`);
      return;
    }

    setLocalError(null);
    await onSubmit({
      trigger: normalizedTrigger,
      label: normalizedLabel,
      content: normalizedContent,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Command" : "Add Command"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this slash command for the whole company."
              : "Create a slash command everyone in this company can use."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="command-trigger">Trigger</Label>
            <div className="flex items-center">
              <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                /
              </span>
              <Input
                id="command-trigger"
                value={trigger}
                onChange={(event) => setTrigger(normalizeTrigger(event.target.value))}
                className="rounded-l-none font-mono"
                placeholder="update-memory"
                maxLength={64}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="command-label">Label</Label>
            <Input
              id="command-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Update memory note"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="command-content">Expanded content</Label>
            <Textarea
              id="command-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Please update your memory after this issue."
              rows={7}
              maxLength={8000}
            />
            <p className="text-[11px] text-muted-foreground text-right">{content.length}/8000</p>
          </div>

          {(localError || error) && (
            <p className="text-xs text-destructive">{localError ?? error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : isEdit ? "Save changes" : "Create command"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
