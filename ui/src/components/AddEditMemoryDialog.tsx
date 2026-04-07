import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memoriesApi } from "../api/memories";
import type { SharedMemory } from "../api/memories";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES: { value: SharedMemory["category"]; label: string }[] = [
  { value: "fact", label: "Fact" },
  { value: "decision", label: "Decision" },
  { value: "procedure", label: "Procedure" },
  { value: "preference", label: "Preference" },
  { value: "lesson_learned", label: "Lesson Learned" },
  { value: "context", label: "Context" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, dialog is in edit mode with pre-filled values */
  memory?: SharedMemory | null;
}

export function AddEditMemoryDialog({ open, onOpenChange, memory }: Props) {
  const isEdit = !!memory;
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [category, setCategory] = useState<SharedMemory["category"]>("fact");
  const [scope, setScope] = useState<"company" | "project">("company");
  const [projectId, setProjectId] = useState<string>("");
  const [tagsInput, setTagsInput] = useState("");
  const [confidence, setConfidence] = useState(100);
  const [expiresAt, setExpiresAt] = useState("");

  // Reset form when dialog opens or memory changes
  useEffect(() => {
    if (open) {
      if (memory) {
        setContent(memory.content);
        setCategory(memory.category);
        setScope(memory.scope);
        setProjectId(memory.projectId ?? "");
        setTagsInput(memory.tags.join(", "));
        setConfidence(Math.round(memory.confidence * 100));
        setExpiresAt(memory.expiresAt ? memory.expiresAt.slice(0, 10) : "");
      } else {
        setContent("");
        setCategory("fact");
        setScope("company");
        setProjectId("");
        setTagsInput("");
        setConfidence(100);
        setExpiresAt("");
      }
    }
  }, [open, memory]);

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && scope === "project",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["memories", selectedCompanyId] });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      return memoriesApi.create(selectedCompanyId!, {
        content,
        scope,
        projectId: scope === "project" && projectId ? projectId : null,
        category,
        tags: tags.length > 0 ? tags : undefined,
        confidence: confidence / 100,
        sourceType: "manual",
        expiresAt: expiresAt || null,
      });
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      return memoriesApi.update(memory!.id, {
        content,
        category,
        tags,
        confidence: confidence / 100,
        expiresAt: expiresAt || null,
      });
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });

  const handleSubmit = () => {
    if (!content.trim()) return;
    if (isEdit) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Knowledge" : "Add Knowledge"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this memory entry."
              : "Add a new memory to the company knowledge base."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Content */}
          <div className="space-y-1.5">
            <Label htmlFor="mem-content">Content</Label>
            <Textarea
              id="mem-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter the knowledge or fact..."
              maxLength={4000}
              rows={4}
            />
            <p className="text-[11px] text-muted-foreground text-right">
              {content.length}/4000
            </p>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as SharedMemory["category"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scope (create mode only) */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/50 w-fit">
                <button
                  type="button"
                  onClick={() => setScope("company")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                    scope === "company"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Company
                </button>
                <button
                  type="button"
                  onClick={() => setScope("project")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                    scope === "project"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Project
                </button>
              </div>
            </div>
          )}

          {/* Project picker (when project scope) */}
          {!isEdit && scope === "project" && projects && projects.length > 0 && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="mem-tags">Tags</Label>
            <Input
              id="mem-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Comma-separated tags, e.g. onboarding, policy"
            />
          </div>

          {/* Confidence */}
          <div className="space-y-1.5">
            <Label>Confidence ({confidence}%)</Label>
            <input
              type="range"
              min={0}
              max={100}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              className="w-full accent-primary h-1.5"
            />
          </div>

          {/* Expires at */}
          <div className="space-y-1.5">
            <Label htmlFor="mem-expires">Expires at (optional)</Label>
            <Input
              id="mem-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "An error occurred"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !content.trim()}>
            {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Knowledge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
