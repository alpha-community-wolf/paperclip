import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { workflowTemplatesApi, type WorkflowTemplate, type RunWorkflowResult } from "../api/workflowTemplates";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Workflow,
  Plus,
  Play,
  Archive,
  ChevronRight,
  Loader2,
  GitBranch,
  Layers,
  Pencil,
} from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  explore: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  plan: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  task: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

function StepBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${TYPE_COLORS[type] ?? "bg-muted text-muted-foreground border-border"}`}>
      {type}
    </span>
  );
}

function StepChain({ steps }: { steps: WorkflowTemplate["steps"] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-1">
          <StepBadge type={step.type} />
          {i < steps.length - 1 && (
            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
          )}
        </div>
      ))}
    </div>
  );
}

function RunWorkflowDialog({
  template,
  open,
  onOpenChange,
}: {
  template: WorkflowTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const variables = template.variables ?? {};

  useEffect(() => {
    if (open) {
      const defaults: Record<string, string> = {};
      for (const [name, decl] of Object.entries(variables)) {
        if (decl.default) defaults[name] = decl.default;
      }
      setBindings(defaults);
    }
  }, [open]);

  const runMutation = useMutation({
    mutationFn: () => workflowTemplatesApi.run(template.id, { variables: bindings }),
    onSuccess: (result: RunWorkflowResult) => {
      onOpenChange(false);
      navigate(`/issues/${result.rootIssueIdentifier}`);
    },
  });

  const requiredVars = Object.entries(variables).filter(([, d]) => d.required !== false);
  const allRequiredFilled = requiredVars.every(([name]) => !!bindings[name]?.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            Run: {template.name}
          </DialogTitle>
          {template.description && (
            <DialogDescription>{template.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Pipeline</div>
            <StepChain steps={template.steps} />
          </div>

          {Object.keys(variables).length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Variables</div>
              {Object.entries(variables).map(([name, decl]) => (
                <div key={name} className="space-y-1">
                  <Label htmlFor={`var-${name}`} className="text-sm">
                    {name}
                    {decl.required !== false && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  {decl.description && (
                    <p className="text-xs text-muted-foreground">{decl.description}</p>
                  )}
                  <Input
                    id={`var-${name}`}
                    placeholder={decl.type === "uuid" ? "UUID" : `Enter ${name}`}
                    value={bindings[name] ?? ""}
                    onChange={(e) => setBindings((prev) => ({ ...prev, [name]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {runMutation.error && (
          <p className="text-xs text-destructive">
            {(runMutation.error as Error).message}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !allRequiredFilled}
          >
            {runMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            Run Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template,
  onRun,
  onEdit,
  onArchive,
}: {
  template: WorkflowTemplate;
  onRun: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();

  const archiveMutation = useMutation({
    mutationFn: () => workflowTemplatesApi.archive(template.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowTemplates.list(selectedCompanyId!) });
      onArchive();
    },
  });

  return (
    <div className="rounded-md border border-border hover:border-border/80 transition-colors">
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate">{template.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">v{template.version}</span>
            </div>
            {template.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 ml-6">{template.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-6">
          <StepChain steps={template.steps} />
        </div>

        {Object.keys(template.variables ?? {}).length > 0 && (
          <div className="flex items-center gap-1.5 ml-6 text-xs text-muted-foreground">
            <Layers className="h-3 w-3" />
            {Object.keys(template.variables).length} variable{Object.keys(template.variables).length !== 1 ? "s" : ""}
            <span className="text-muted-foreground/40">·</span>
            {Object.entries(template.variables)
              .map(([k]) => k)
              .join(", ")}
          </div>
        )}

        <div className="flex items-center gap-2 ml-6 pt-1">
          <Button size="sm" variant="default" className="h-7 text-xs gap-1.5" onClick={onRun}>
            <Play className="h-3 w-3" />
            Run
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1.5 text-muted-foreground"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
          >
            <Archive className="h-3 w-3" />
            Archive
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowTemplates() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const companyId = selectedCompanyId!;
  const [runTemplate, setRunTemplate] = useState<WorkflowTemplate | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Workflows" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const { data: templates, isLoading } = useQuery({
    queryKey: queryKeys.workflowTemplates.list(companyId),
    queryFn: () => workflowTemplatesApi.list(companyId),
    enabled: !!companyId,
  });

  if (!selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Workflow Templates</h1>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => navigate("/workflow-templates/new")}
        >
          <Plus className="h-3.5 w-3.5" />
          New Template
        </Button>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Reusable multi-step agent pipelines. Define steps, variables, and dependencies, then run with one click.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading templates...
        </div>
      )}

      {templates && templates.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No workflow templates yet. They will be seeded on server startup, or create one manually.
        </div>
      )}

      {templates && templates.length > 0 && (
        <div className="space-y-3">
          {templates.map((tmpl) => (
            <TemplateCard
              key={tmpl.id}
              template={tmpl}
              onRun={() => setRunTemplate(tmpl)}
              onEdit={() => navigate(`/workflow-templates/${tmpl.id}`)}
              onArchive={() => {}}
            />
          ))}
        </div>
      )}

      {runTemplate && (
        <RunWorkflowDialog
          template={runTemplate}
          open={!!runTemplate}
          onOpenChange={(open) => { if (!open) setRunTemplate(null); }}
        />
      )}
    </div>
  );
}
