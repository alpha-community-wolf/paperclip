import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "../api/client";
import type { Command, CreateCommand, UpdateCommand } from "@paperclipai/shared";
import { Command as CommandIcon, Pencil, Trash2 } from "lucide-react";
import { commandsApi } from "../api/commands";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "./EmptyState";
import { PageSkeleton } from "./PageSkeleton";
import { CommandDialog } from "./CommandDialog";
import { Button } from "@/components/ui/button";

function errorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  const apiErr = err as ApiError;
  if (apiErr?.message) return apiErr.message;
  return "Request failed";
}

export function SidebarCommands() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Command | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: commands, isLoading, error } = useQuery({
    queryKey: queryKeys.commands.list(selectedCompanyId ?? "__none__"),
    queryFn: () => commandsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const invalidate = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.commands.list(selectedCompanyId) });
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateCommand) => commandsApi.create(selectedCompanyId!, payload),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateCommand) => commandsApi.update(selectedCompanyId!, editing!.id, payload),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => commandsApi.remove(selectedCompanyId!, id),
    onSuccess: () => invalidate(),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const saveError = errorMessage(createMutation.error ?? updateMutation.error);

  const existingTriggers = useMemo(
    () => (commands ?? []).map((item) => item.trigger),
    [commands],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={CommandIcon} message="Select a company to manage slash commands." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4 animate-page-enter">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Add Command
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load commands: {errorMessage(error)}
        </div>
      ) : commands && commands.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {commands.map((item) => (
            <div key={item.id} className="flex items-start gap-3 border-b border-border p-4 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">/{item.trigger}</code>
                  <span className="truncate text-sm font-medium">{item.label}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">
                  {item.content}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setEditing(item);
                    setDialogOpen(true);
                  }}
                  aria-label={`Edit ${item.trigger}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (!window.confirm(`Delete /${item.trigger}?`)) return;
                    deleteMutation.mutate(item.id);
                  }}
                  aria-label={`Delete ${item.trigger}`}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CommandIcon}
          message="No slash commands yet."
          description="Create reusable prompts, snippets, and templates your whole company can insert from any markdown editor by typing /."
          action="Add Command"
          onAction={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        />
      )}

      <CommandDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        command={editing}
        existingTriggers={existingTriggers}
        onSubmit={async (payload) => {
          if (editing) {
            await updateMutation.mutateAsync(payload);
          } else {
            await createMutation.mutateAsync(payload as CreateCommand);
          }
        }}
        isPending={isSaving}
        error={saveError || null}
      />
    </div>
  );
}
