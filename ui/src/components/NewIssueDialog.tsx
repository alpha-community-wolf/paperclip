import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Maximize2, Minimize2, Paperclip } from "lucide-react";
import { cn } from "../lib/utils";
import {
  IssueCreateFormBody,
} from "./issue-create/IssueCreateFormBody";
import { boardIssueCreateClients } from "./issue-create/clients";
import {
  BOARD_ISSUE_DRAFT_KEY,
  getContrastTextColor,
} from "./issue-create/shared";

export function NewIssueDialog() {
  const { newIssueOpen, newIssueDefaults, closeNewIssue } = useDialog();
  const { companies, selectedCompanyId, selectedCompany } = useCompany();
  const [dialogCompanyId, setDialogCompanyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [formBusy, setFormBusy] = useState(false);

  const effectiveCompanyId = dialogCompanyId ?? selectedCompanyId;
  const dialogCompany = companies.find((c) => c.id === effectiveCompanyId) ?? selectedCompany;

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: newIssueOpen,
  });
  const projectOrderUserId = session?.user?.id ?? session?.session?.userId ?? null;

  useEffect(() => {
    if (newIssueOpen) {
      setDialogCompanyId(selectedCompanyId);
      setExpanded(false);
      setCompanyOpen(false);
    }
  }, [newIssueOpen, selectedCompanyId]);

  function handleCompanyChange(companyId: string) {
    if (companyId === effectiveCompanyId) return;
    setDialogCompanyId(companyId);
  }

  return (
    <Dialog
      open={newIssueOpen}
      onOpenChange={(open) => {
        if (!open && formBusy) return;
        if (!open) closeNewIssue();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "p-0 gap-0 flex flex-col max-h-[calc(100dvh-2rem)]",
          expanded
            ? "sm:max-w-2xl h-[calc(100dvh-2rem)]"
            : "sm:max-w-lg",
        )}
        onEscapeKeyDown={(event) => {
          if (formBusy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (formBusy) {
            event.preventDefault();
            return;
          }
          const target = event.detail.originalEvent.target as HTMLElement | null;
          if (target?.closest("[data-radix-popper-content-wrapper]")) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "px-1.5 py-0.5 rounded text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity",
                    !dialogCompany?.brandColor && "bg-muted",
                  )}
                  style={
                    dialogCompany?.brandColor
                      ? {
                          backgroundColor: dialogCompany.brandColor,
                          color: getContrastTextColor(dialogCompany.brandColor),
                        }
                      : undefined
                  }
                >
                  {(dialogCompany?.name ?? "").slice(0, 3).toUpperCase()}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="start">
                {companies.filter((c) => c.status !== "archived").map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                      c.id === effectiveCompanyId && "bg-accent",
                    )}
                    onClick={() => {
                      handleCompanyChange(c.id);
                      setCompanyOpen(false);
                    }}
                  >
                    <span
                      className={cn(
                        "px-1 py-0.5 rounded text-[10px] font-semibold leading-none",
                        !c.brandColor && "bg-muted",
                      )}
                      style={
                        c.brandColor
                          ? {
                              backgroundColor: c.brandColor,
                              color: getContrastTextColor(c.brandColor),
                            }
                          : undefined
                      }
                    >
                      {c.name.slice(0, 3).toUpperCase()}
                    </span>
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground/60">&rsaquo;</span>
            <span>New issue</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={() => setExpanded(!expanded)}
              type="button"
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={() => closeNewIssue()}
              type="button"
            >
              <span className="text-lg leading-none">&times;</span>
            </Button>
          </div>
        </div>

        {newIssueDefaults.attachedFile ? (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
            <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-medium text-primary">Workspace file attached</span>
            <code className="ml-auto text-xs text-muted-foreground font-mono truncate max-w-[60%]">
              {newIssueDefaults.attachedFile}
            </code>
          </div>
        ) : null}

        {effectiveCompanyId ? (
          <IssueCreateFormBody
            variant="dialog"
            cacheScope="board"
            companyId={effectiveCompanyId}
            active={newIssueOpen}
            projectOrderUserId={projectOrderUserId}
            clients={boardIssueCreateClients}
            draftKey={BOARD_ISSUE_DRAFT_KEY}
            defaults={newIssueDefaults}
            expanded={expanded}
            onSuccess={() => {
              closeNewIssue();
            }}
            onDiscard={closeNewIssue}
            onMutationBusyChange={setFormBusy}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
