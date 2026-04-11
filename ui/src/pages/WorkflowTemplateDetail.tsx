import { useEffect, useState } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  workflowTemplatesApi,
  type WorkflowStep,
  type VariableDeclaration,
} from "../api/workflowTemplates";
import { agentsApi } from "../api/agents";
import type { Agent } from "@paperclipai/shared";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  GripVertical,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

const EMPTY_STEP: WorkflowStep = {
  key: "",
  title: "",
  type: "task",
  priority: "medium",
};

const EMPTY_VARIABLE: VariableDeclaration = {
  type: "string",
  required: true,
};

function detectCycle(steps: WorkflowStep[]): string | null {
  const keySet = new Set(steps.map((s) => s.key));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const adj = new Map<string, string[]>();

  for (const step of steps) {
    adj.set(step.key, []);
  }
  for (const step of steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!keySet.has(dep)) return `Step "${step.key}" depends on unknown step "${dep}"`;
      adj.get(dep)?.push(step.key);
    }
  }

  function dfs(node: string): boolean {
    visited.add(node);
    stack.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (stack.has(neighbor)) return true;
      if (!visited.has(neighbor) && dfs(neighbor)) return true;
    }
    stack.delete(node);
    return false;
  }

  for (const key of keySet) {
    if (!visited.has(key) && dfs(key)) return "Steps contain a circular dependency";
  }
  return null;
}

function StepEditor({
  step,
  index,
  allStepKeys,
  agents,
  onChange,
  onRemove,
}: {
  step: WorkflowStep;
  index: number;
  allStepKeys: string[];
  agents?: Agent[];
  onChange: (step: WorkflowStep) => void;
  onRemove: () => void;
}) {
  const otherKeys = allStepKeys.filter((k) => k !== step.key && k !== "");

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        <span className="text-xs font-medium text-muted-foreground w-5">#{index + 1}</span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Key</Label>
          <Input
            placeholder="e.g. explore"
            className="h-8 text-sm"
            value={step.key}
            onChange={(e) => onChange({ ...step, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={step.type} onValueChange={(v) => onChange({ ...step, type: v as WorkflowStep["type"] })}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="explore">Explore</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="task">Task</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Title</Label>
        <Input
          placeholder='e.g. Explore: {{ topic }}'
          className="h-8 text-sm"
          value={step.title}
          onChange={(e) => onChange({ ...step, title: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Priority</Label>
          <Select value={step.priority ?? "medium"} onValueChange={(v) => onChange({ ...step, priority: v as WorkflowStep["priority"] })}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Assignee</Label>
          {step.assigneeAgentId?.includes("{{") ? (
            <div className="flex gap-1.5">
              <Input
                placeholder='{{ variable }}'
                className="h-8 text-sm font-mono flex-1"
                value={step.assigneeAgentId}
                onChange={(e) => onChange({ ...step, assigneeAgentId: e.target.value || undefined })}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs px-2"
                onClick={() => onChange({ ...step, assigneeAgentId: undefined })}
              >
                Clear
              </Button>
            </div>
          ) : (
            <Select
              value={step.assigneeAgentId ?? "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") onChange({ ...step, assigneeAgentId: undefined });
                else if (v === "__variable__") onChange({ ...step, assigneeAgentId: "{{ }}" });
                else onChange({ ...step, assigneeAgentId: v });
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {agents?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
                <SelectItem value="__variable__">
                  <span className="font-mono text-muted-foreground">{"{{ variable }}"}</span>
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {otherKeys.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Depends On</Label>
          <div className="flex flex-wrap gap-2">
            {otherKeys.map((key) => {
              const selected = step.dependsOn?.includes(key) ?? false;
              return (
                <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(checked) => {
                      const deps = new Set(step.dependsOn ?? []);
                      if (checked) deps.add(key);
                      else deps.delete(key);
                      onChange({ ...step, dependsOn: deps.size > 0 ? [...deps] : undefined });
                    }}
                  />
                  <span className="font-mono">{key}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Description (optional)</Label>
        <Textarea
          placeholder="Step description..."
          className="text-sm min-h-[60px]"
          value={step.description ?? ""}
          onChange={(e) => onChange({ ...step, description: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}

function VariableEditor({
  name,
  decl,
  onChangeName: onNameChange,
  onChangeDecl: onDeclChange,
  onRemove,
}: {
  name: string;
  decl: VariableDeclaration;
  onChangeName: (name: string) => void;
  onChangeDecl: (decl: VariableDeclaration) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              className="h-8 text-sm font-mono"
              value={name}
              onChange={(e) => onNameChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={decl.type} onValueChange={(v) => onDeclChange({ ...decl, type: v as "string" | "uuid" })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="uuid">UUID</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default</Label>
            <Input
              className="h-8 text-sm"
              placeholder="Optional"
              value={decl.default ?? ""}
              onChange={(e) => onDeclChange({ ...decl, default: e.target.value || undefined })}
            />
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive mt-5"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <Checkbox
            checked={decl.required !== false}
            onCheckedChange={(checked) => onDeclChange({ ...decl, required: !!checked })}
          />
          Required
        </label>
        <Input
          className="h-7 text-xs flex-1"
          placeholder="Description (optional)"
          value={decl.description ?? ""}
          onChange={(e) => onDeclChange({ ...decl, description: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}

export function WorkflowTemplateDetail() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId!;
  const isNew = templateId === "new";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([{ ...EMPTY_STEP }]);
  const [variables, setVariables] = useState<Array<{ name: string; decl: VariableDeclaration }>>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: queryKeys.workflowTemplates.detail(templateId!),
    queryFn: () => workflowTemplatesApi.get(templateId!),
    enabled: !isNew && !!templateId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description ?? "");
      setSteps(existing.steps);
      setVariables(
        Object.entries(existing.variables ?? {}).map(([name, decl]) => ({ name, decl })),
      );
    }
  }, [existing]);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Workflows", href: "/workflow-templates" },
      { label: isNew ? "New Template" : (existing?.name ?? "...") },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name, isNew, existing?.name]);

  // Real-time validation
  useEffect(() => {
    const keys = steps.map((s) => s.key).filter(Boolean);
    const uniqueKeys = new Set(keys);
    if (keys.length !== uniqueKeys.size) {
      setValidationError("Duplicate step keys");
      return;
    }
    const cycle = detectCycle(steps.filter((s) => s.key));
    if (cycle) {
      setValidationError(cycle);
      return;
    }
    setValidationError(null);
  }, [steps]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const varsObj: Record<string, VariableDeclaration> = {};
      for (const v of variables) {
        if (v.name) varsObj[v.name] = v.decl;
      }
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        steps,
        variables: varsObj,
      };
      if (isNew) {
        return workflowTemplatesApi.create(companyId, payload);
      } else {
        return workflowTemplatesApi.update(templateId!, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowTemplates.list(companyId) });
      navigate("/workflow-templates");
    },
  });

  const canSave =
    name.trim() &&
    steps.length > 0 &&
    steps.every((s) => s.key && s.title) &&
    !validationError;

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading template...
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/workflow-templates")}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <h1 className="text-lg font-semibold">{isNew ? "New Workflow Template" : "Edit Template"}</h1>
      </div>

      {/* Name & Description */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input
            placeholder="e.g. Explore → Plan → Build"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea
            placeholder="What does this workflow do?"
            className="min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      {/* Variables */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Variables</h2>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setVariables((prev) => [...prev, { name: "", decl: { ...EMPTY_VARIABLE } }])}
          >
            <Plus className="h-3 w-3" />
            Add Variable
          </Button>
        </div>
        {variables.length === 0 && (
          <p className="text-xs text-muted-foreground">No variables. Add variables to make the template reusable.</p>
        )}
        {variables.map((v, i) => (
          <VariableEditor
            key={i}
            name={v.name}
            decl={v.decl}
            onChangeName={(newName) => {
              setVariables((prev) => prev.map((item, j) => (j === i ? { ...item, name: newName } : item)));
            }}
            onChangeDecl={(newDecl) => {
              setVariables((prev) => prev.map((item, j) => (j === i ? { ...item, decl: newDecl } : item)));
            }}
            onRemove={() => setVariables((prev) => prev.filter((_, j) => j !== i))}
          />
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Steps</h2>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setSteps((prev) => [...prev, { ...EMPTY_STEP }])}
            disabled={steps.length >= 20}
          >
            <Plus className="h-3 w-3" />
            Add Step
          </Button>
        </div>
        {steps.map((step, i) => (
          <StepEditor
            key={i}
            step={step}
            index={i}
            allStepKeys={steps.map((s) => s.key)}
            agents={agents}
            onChange={(updated) => setSteps((prev) => prev.map((s, j) => (j === i ? updated : s)))}
            onRemove={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
          />
        ))}
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {validationError}
        </div>
      )}

      {/* Save error */}
      {saveMutation.error && (
        <p className="text-xs text-destructive">
          {(saveMutation.error as Error).message}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !canSave}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          {isNew ? "Create Template" : "Save Changes"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/workflow-templates")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
