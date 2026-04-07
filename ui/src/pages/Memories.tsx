import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  Search,
  Building2,
  FolderOpen,
  Filter,
  AlertTriangle,
  Plus,
  X,
} from "lucide-react";
import { memoriesApi } from "../api/memories";
import type { MemoryFilters, SharedMemory } from "../api/memories";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { MemoryCard } from "../components/MemoryCard";
import { AddEditMemoryDialog } from "../components/AddEditMemoryDialog";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSkeleton } from "../components/PageSkeleton";

const CATEGORIES = [
  { value: "fact", label: "Facts" },
  { value: "decision", label: "Decisions" },
  { value: "procedure", label: "Procedures" },
  { value: "preference", label: "Preferences" },
  { value: "lesson_learned", label: "Lessons" },
  { value: "context", label: "Context" },
] as const;

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "disputed", label: "Disputed" },
  { value: "superseded", label: "Superseded" },
  { value: "archived", label: "Archived" },
] as const;

const PAGE_SIZE = 20;

export function Memories() {
  const { selectedCompanyId } = useCompany();
  const [scope, setScope] = useState<"company" | "project">("company");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("__all__");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("__all__");
  const [selectedStatus, setSelectedStatus] = useState<string>("active");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<SharedMemory | null>(null);

  const handleEdit = useCallback((memory: SharedMemory) => {
    setEditingMemory(memory);
    setDialogOpen(true);
  }, []);

  // Debounce search
  const debounceRef = useMemo(() => ({ timer: null as ReturnType<typeof setTimeout> | null }), []);
  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceRef.timer) clearTimeout(debounceRef.timer);
      debounceRef.timer = setTimeout(() => {
        setDebouncedQuery(value);
        setPage(0);
      }, 300);
    },
    [debounceRef],
  );

  const filters: MemoryFilters = useMemo(
    () => ({
      q: debouncedQuery || undefined,
      scope,
      projectId: scope === "project" && selectedProjectId !== "__all__" ? selectedProjectId : undefined,
      category: selectedCategory !== "__all__" ? selectedCategory : undefined,
      status: selectedStatus !== "__all__" ? selectedStatus : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [scope, selectedProjectId, debouncedQuery, selectedCategory, selectedStatus, page],
  );

  const filterKey = useMemo(
    () => ({
      scope: filters.scope,
      projectId: filters.projectId,
      category: filters.category,
      status: filters.status,
      q: filters.q,
      offset: String(filters.offset),
    }),
    [filters],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.memories.list(selectedCompanyId!, filterKey),
    queryFn: () => memoriesApi.list(selectedCompanyId!, filters),
    enabled: !!selectedCompanyId,
    placeholderData: (prev) => prev,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: conflictsData } = useQuery({
    queryKey: queryKeys.memories.conflicts(selectedCompanyId!),
    queryFn: () => memoriesApi.conflicts(selectedCompanyId!, 5),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    agents?.forEach((a) => map.set(a.id, { name: a.name }));
    return map;
  }, [agents]);

  const memories = data?.memories ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasActiveFilters = selectedCategory !== "__all__" || selectedStatus !== "active" || debouncedQuery;
  const conflictCount = conflictsData?.total ?? 0;

  if (!selectedCompanyId) return null;
  if (isLoading && !data) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Knowledge Base</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {total} memor{total === 1 ? "y" : "ies"} across your organization
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {conflictCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {conflictCount} potential conflict{conflictCount !== 1 ? "s" : ""}
            </div>
          )}
          <Button
            size="sm"
            onClick={() => { setEditingMemory(null); setDialogOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Knowledge
          </Button>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/50 w-fit">
        <button
          onClick={() => { setScope("company"); setPage(0); }}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
            scope === "company"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Building2 className="h-3.5 w-3.5" />
          Company
        </button>
        <button
          onClick={() => { setScope("project"); setPage(0); }}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
            scope === "project"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Project
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search knowledge base..."
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setDebouncedQuery(""); setPage(0); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {scope === "project" && projects && projects.length > 0 && (
          <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); setPage(0); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(0); }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setSearchQuery("");
              setDebouncedQuery("");
              setSelectedCategory("__all__");
              setSelectedStatus("active");
              setPage(0);
            }}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load memories: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Memory list */}
      {memories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Brain className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {debouncedQuery
              ? `No memories matching "${debouncedQuery}"`
              : "No memories found with these filters"}
          </p>
          {hasActiveFilters && (
            <Button
              variant="link"
              size="sm"
              className="mt-1"
              onClick={() => {
                setSearchQuery("");
                setDebouncedQuery("");
                setSelectedCategory("");
                setSelectedStatus("active");
                setPage(0);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {memories.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              agentMap={agentMap}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AddEditMemoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        memory={editingMemory}
      />
    </div>
  );
}
