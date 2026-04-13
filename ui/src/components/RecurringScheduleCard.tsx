import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import type { TaskCronSchedule, TaskCronIssueMode } from "@paperclipai/shared";
import { cronPresetOptions } from "../lib/cron-presets";
import { relativeTime } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock3, ExternalLink, Pencil, Save, Trash2, X } from "lucide-react";

type ScheduleUpdate = Partial<{
  name: string;
  expression: string;
  timezone: string;
  enabled: boolean;
  issueMode: TaskCronIssueMode;
}>;

interface RecurringScheduleCardProps {
  schedule: TaskCronSchedule;
  onUpdate: (scheduleId: string, fields: ScheduleUpdate) => void;
  onDelete: (scheduleId: string) => void;
  updating: boolean;
  deleting: boolean;
  issueIdentifier?: string | null;
}

export function RecurringScheduleCard({
  schedule,
  onUpdate,
  onDelete,
  updating,
  deleting,
  issueIdentifier,
}: RecurringScheduleCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(schedule.name);
  const [expression, setExpression] = useState(schedule.expression);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [issueMode, setIssueMode] = useState<TaskCronIssueMode>(schedule.issueMode);

  const presetValue = useMemo(() => {
    const match = cronPresetOptions.find((o) => o.expression === expression.trim());
    return match?.id ?? "__custom__";
  }, [expression]);

  const dirty =
    name !== schedule.name ||
    expression !== schedule.expression ||
    timezone !== schedule.timezone ||
    issueMode !== schedule.issueMode;

  function resetForm() {
    setName(schedule.name);
    setExpression(schedule.expression);
    setTimezone(schedule.timezone);
    setIssueMode(schedule.issueMode);
    setEditing(false);
  }

  function handleSave() {
    const fields: ScheduleUpdate = {};
    if (name !== schedule.name) fields.name = name.trim();
    if (expression !== schedule.expression) fields.expression = expression.trim();
    if (timezone !== schedule.timezone) fields.timezone = timezone.trim();
    if (issueMode !== schedule.issueMode) fields.issueMode = issueMode;
    if (Object.keys(fields).length > 0) {
      onUpdate(schedule.id, fields);
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="rounded border border-border p-2">
        <div className="flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium truncate">{schedule.name}</span>
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {schedule.expression} ({schedule.timezone})
          </span>
          <span className="ml-auto flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setEditing(true)}
              title="Edit schedule"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => onUpdate(schedule.id, { enabled: !schedule.enabled })}
              disabled={updating}
            >
              {schedule.enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-destructive"
              onClick={() => onDelete(schedule.id)}
              disabled={deleting}
              title="Delete schedule"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
          <span>{schedule.enabled ? "Active" : "Disabled"}</span>
          <span>·</span>
          <span>
            {schedule.issueMode === "reopen_existing"
              ? "reopens issue"
              : schedule.issueMode === "reuse_existing"
                ? "reuses issue"
                : "creates new issue"}
          </span>
          <span>·</span>
          <span>next {schedule.nextTriggerAt ? relativeTime(schedule.nextTriggerAt) : "not scheduled"}</span>
          {schedule.issueId && (
            <>
              <span>·</span>
              <Link
                to={`/issues/${schedule.issueId}`}
                className="inline-flex items-center gap-0.5 underline hover:text-foreground"
              >
                {issueIdentifier || schedule.issueId.slice(0, 8)}
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-primary/30 bg-muted/20 p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Name</label>
          <input
            className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Timezone</label>
          <input
            className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Preset</label>
          <Select
            value={presetValue}
            onValueChange={(nextId) => {
              if (nextId === "__custom__") return;
              const preset = cronPresetOptions.find((o) => o.id === nextId);
              if (preset) setExpression(preset.expression);
            }}
          >
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue placeholder="Custom expression" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__custom__">Custom expression</SelectItem>
              {cronPresetOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label} ({option.expression})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Cron expression</label>
          <input
            className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs font-mono"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="0 9 * * 1-5"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Issue behavior</label>
        <Select value={issueMode} onValueChange={(v) => setIssueMode(v as TaskCronIssueMode)}>
          <SelectTrigger size="sm" className="w-full text-xs sm:w-auto min-w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reopen_existing">Reopen this issue when done</SelectItem>
            <SelectItem value="reuse_existing">Reuse this issue</SelectItem>
            <SelectItem value="create_new">Create a new issue each run</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {schedule.issueId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Linked issue:</span>
          <Link
            to={`/issues/${schedule.issueId}`}
            className="inline-flex items-center gap-1 underline hover:text-foreground font-medium"
          >
            {issueIdentifier || schedule.issueId.slice(0, 8)}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || updating || name.trim().length === 0 || expression.trim().length === 0}
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {updating ? "Saving..." : "Save"}
        </Button>
        <Button variant="ghost" size="sm" onClick={resetForm}>
          <X className="h-3.5 w-3.5 mr-1.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
