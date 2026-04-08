import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import {
  Brain,
  Search,
  List,
  X,
  User,
  FolderOpen,
  Tag,
  Layers,
  Circle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  Building2,
} from "lucide-react";
import { memoriesApi } from "../api/memories";
import type { SharedMemory } from "../api/memories";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
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
import {
  KnowledgeGraphCanvas,
  type GraphNode,
  type GraphEdge,
} from "../components/KnowledgeGraphCanvas";

// ---------------------------------------------------------------------------
// Graph builder — transforms API data into nodes + edges
// ---------------------------------------------------------------------------

interface Agent {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
}

const CATEGORIES = [
  "fact",
  "decision",
  "procedure",
  "preference",
  "lesson_learned",
  "context",
] as const;

function buildGraph(
  memories: SharedMemory[],
  agents: Agent[],
  projects: Project[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  const agentWeight = new Map<string, number>();
  const projectWeight = new Map<string, number>();
  const categoryWeight = new Map<string, number>();
  const topicWeight = new Map<string, number>();

  // Pre-count weights
  for (const m of memories) {
    if (m.sourceAgentId) agentWeight.set(m.sourceAgentId, (agentWeight.get(m.sourceAgentId) ?? 0) + 1);
    if (m.projectId) projectWeight.set(m.projectId, (projectWeight.get(m.projectId) ?? 0) + 1);
    categoryWeight.set(m.category, (categoryWeight.get(m.category) ?? 0) + 1);
    for (const tag of m.tags) {
      topicWeight.set(tag, (topicWeight.get(tag) ?? 0) + 1);
    }
  }

  // Agent nodes (only those with memories)
  for (const a of agents) {
    if (!agentWeight.has(a.id)) continue;
    nodes.push({
      id: `agent:${a.id}`,
      label: a.name,
      type: "agent",
      weight: agentWeight.get(a.id) ?? 0,
      meta: { agentId: a.id },
    });
    nodeIds.add(`agent:${a.id}`);
  }

  // Project nodes (only those with memories)
  for (const p of projects) {
    if (!projectWeight.has(p.id)) continue;
    nodes.push({
      id: `project:${p.id}`,
      label: p.name,
      type: "project",
      weight: projectWeight.get(p.id) ?? 0,
      meta: { projectId: p.id },
    });
    nodeIds.add(`project:${p.id}`);
  }

  // Category nodes
  for (const cat of CATEGORIES) {
    if (!categoryWeight.has(cat)) continue;
    const label = cat === "lesson_learned" ? "Lessons" : cat.charAt(0).toUpperCase() + cat.slice(1);
    nodes.push({
      id: `category:${cat}`,
      label,
      type: "category",
      weight: categoryWeight.get(cat) ?? 0,
    });
    nodeIds.add(`category:${cat}`);
  }

  // Topic nodes
  for (const [tag, w] of topicWeight) {
    nodes.push({
      id: `topic:${tag}`,
      label: tag,
      type: "topic",
      weight: w,
    });
    nodeIds.add(`topic:${tag}`);
  }

  // Memory nodes + edges
  for (const m of memories) {
    const memId = `memory:${m.id}`;
    let edgeCount = 0;

    // created_by
    if (m.sourceAgentId && nodeIds.has(`agent:${m.sourceAgentId}`)) {
      edges.push({ id: `e-${m.id}-agent`, source: memId, target: `agent:${m.sourceAgentId}`, edgeType: "created_by" });
      edgeCount++;
    }

    // scoped_to
    if (m.projectId && nodeIds.has(`project:${m.projectId}`)) {
      edges.push({ id: `e-${m.id}-proj`, source: memId, target: `project:${m.projectId}`, edgeType: "scoped_to" });
      edgeCount++;
    }

    // categorized_as
    if (nodeIds.has(`category:${m.category}`)) {
      edges.push({ id: `e-${m.id}-cat`, source: memId, target: `category:${m.category}`, edgeType: "categorized_as" });
      edgeCount++;
    }

    // tagged_with
    for (const tag of m.tags) {
      if (nodeIds.has(`topic:${tag}`)) {
        edges.push({ id: `e-${m.id}-tag-${tag}`, source: memId, target: `topic:${tag}`, edgeType: "tagged_with" });
        edgeCount++;
      }
    }

    // supersedes
    if (m.supersededBy) {
      edges.push({ id: `e-${m.id}-sup`, source: memId, target: `memory:${m.supersededBy}`, edgeType: "supersedes" });
      edgeCount++;
    }

    nodes.push({
      id: memId,
      label: m.content.slice(0, 60),
      type: "memory",
      weight: edgeCount,
      confidence: m.confidence,
      meta: {
        memoryId: m.id,
        content: m.content,
        category: m.category,
        tags: m.tags,
        confidence: m.confidence,
        status: m.status,
        sourceAgentId: m.sourceAgentId,
        accessCount: m.accessCount,
        createdAt: m.createdAt,
      },
    });
  }

  // Co-occurrence edges between topics that share 2+ memories
  const topicMemMap = new Map<string, Set<string>>();
  for (const m of memories) {
    for (const tag of m.tags) {
      if (!topicMemMap.has(tag)) topicMemMap.set(tag, new Set());
      topicMemMap.get(tag)!.add(m.id);
    }
  }
  const topicList = [...topicMemMap.keys()];
  for (let i = 0; i < topicList.length; i++) {
    for (let j = i + 1; j < topicList.length; j++) {
      const setA = topicMemMap.get(topicList[i])!;
      const setB = topicMemMap.get(topicList[j])!;
      let overlap = 0;
      for (const id of setA) {
        if (setB.has(id)) overlap++;
      }
      if (overlap >= 2) {
        edges.push({
          id: `e-cooccur-${topicList[i]}-${topicList[j]}`,
          source: `topic:${topicList[i]}`,
          target: `topic:${topicList[j]}`,
          edgeType: "co-occurrence",
        });
      }
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

const LEGEND: { type: GraphNode["type"]; label: string; color: string }[] = [
  { type: "agent", label: "Agent", color: "#f472b6" },
  { type: "project", label: "Project", color: "#4ade80" },
  { type: "category", label: "Category", color: "#60a5fa" },
  { type: "topic", label: "Topic", color: "#fb923c" },
  { type: "memory", label: "Memory", color: "#94a3b8" },
];

const LEGEND_ICON: Record<string, typeof Brain> = {
  agent: User,
  project: FolderOpen,
  category: Layers,
  topic: Tag,
  memory: Circle,
};

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  node,
  agentMap,
  onClose,
}: {
  node: GraphNode;
  agentMap: Map<string, { name: string }>;
  onClose: () => void;
}) {
  const color = LEGEND.find((l) => l.type === node.type)?.color ?? "#94a3b8";
  const raw = node.meta ?? {};
  // Cast to a typed shape for the detail panel
  const meta = raw as {
    content?: string;
    category?: string;
    confidence?: number;
    status?: string;
    sourceAgentId?: string;
    accessCount?: number;
    createdAt?: string;
    tags?: string[];
  };

  return (
    <div className="absolute right-4 top-4 bottom-4 w-80 bg-popover/95 backdrop-blur-md border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden z-20 animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {node.type}
        </span>
        <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <h3 className="font-semibold text-foreground leading-snug">{node.label}</h3>

        {node.type === "memory" && meta.content && (
          <p className="text-foreground/80 text-[13px] leading-relaxed whitespace-pre-wrap">
            {meta.content}
          </p>
        )}

        <div className="space-y-2 text-xs text-muted-foreground">
          {meta.category && (
            <div className="flex justify-between">
              <span>Category</span>
              <span className="text-foreground capitalize">{meta.category.replace("_", " ")}</span>
            </div>
          )}
          {meta.confidence !== undefined && (
            <div className="flex justify-between items-center">
              <span>Confidence</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${meta.confidence * 100}%` }}
                  />
                </div>
                <span className="text-foreground tabular-nums">{(meta.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
          {meta.status && (
            <div className="flex justify-between">
              <span>Status</span>
              <span className="text-foreground capitalize">{meta.status}</span>
            </div>
          )}
          {meta.sourceAgentId && (
            <div className="flex justify-between">
              <span>Source agent</span>
              <span className="text-foreground">
                {agentMap.get(meta.sourceAgentId)?.name ?? "Unknown"}
              </span>
            </div>
          )}
          {meta.accessCount !== undefined && (
            <div className="flex justify-between">
              <span>Access count</span>
              <span className="text-foreground tabular-nums">{meta.accessCount}</span>
            </div>
          )}
          {meta.createdAt && (
            <div className="flex justify-between">
              <span>Created</span>
              <span className="text-foreground">{new Date(meta.createdAt).toLocaleDateString()}</span>
            </div>
          )}
          {meta.tags && meta.tags.length > 0 && (
            <div>
              <span className="block mb-1">Tags</span>
              <div className="flex flex-wrap gap-1">
                {meta.tags.map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[11px]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/30 tabular-nums">
          {node.weight} connection{node.weight !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function KnowledgeGraph() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string>("__all__");
  const [categoryFilter, setCategoryFilter] = useState<string>("__all__");
  const [agentFilter, setAgentFilter] = useState<string>("__all__");

  const prefix = selectedCompany?.issuePrefix ?? "";

  // Fetch all memories with pagination (API max is 200 per page)
  const PAGE_SIZE = 200;
  const { data: memoriesData, isLoading: memoriesLoading } = useQuery({
    queryKey: queryKeys.memories.list(selectedCompanyId!, {
      scope: "__graph__",
      status: "active",
    }),
    queryFn: async () => {
      const first = await memoriesApi.list(selectedCompanyId!, { status: "active", limit: PAGE_SIZE, offset: 0 });
      if (first.total <= PAGE_SIZE) return first;

      // Fetch remaining pages in parallel
      const remaining = Math.ceil((first.total - PAGE_SIZE) / PAGE_SIZE);
      const pages = await Promise.all(
        Array.from({ length: remaining }, (_, i) =>
          memoriesApi.list(selectedCompanyId!, {
            status: "active",
            limit: PAGE_SIZE,
            offset: PAGE_SIZE * (i + 1),
          }),
        ),
      );
      return {
        memories: [first.memories, ...pages.map((p) => p.memories)].flat(),
        total: first.total,
      };
    },
    enabled: !!selectedCompanyId,
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

  const agentMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    agents?.forEach((a) => map.set(a.id, { name: a.name }));
    return map;
  }, [agents]);

  // Apply client-side filters before building the graph
  const filteredMemories = useMemo(() => {
    let mems = memoriesData?.memories ?? [];
    if (scopeFilter !== "__all__") {
      mems = mems.filter((m) => m.scope === scopeFilter);
    }
    if (categoryFilter !== "__all__") {
      mems = mems.filter((m) => m.category === categoryFilter);
    }
    if (agentFilter !== "__all__") {
      mems = mems.filter((m) => m.sourceAgentId === agentFilter);
    }
    return mems;
  }, [memoriesData, scopeFilter, categoryFilter, agentFilter]);

  const { nodes, edges } = useMemo(
    () => buildGraph(filteredMemories, agents ?? [], projects ?? []),
    [filteredMemories, agents, projects],
  );

  const handleSelectNode = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
    setSelectedNodeId(node?.id ?? null);
  }, []);

  // Stats
  const memCount = filteredMemories.length;
  const agentCount = nodes.filter((n) => n.type === "agent").length;
  const topicCount = nodes.filter((n) => n.type === "topic").length;

  if (!selectedCompanyId) return null;
  if (memoriesLoading) return <PageSkeleton variant="list" />;

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] animate-page-enter">
      {/* Header bar */}
      <div className="flex items-center justify-between px-1 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Knowledge Graph</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {memCount} memories &middot; {agentCount} agents &middot; {topicCount} topics &middot; {edges.length} connections
            </p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/50">
            <Link
              to={prefix ? `/${prefix}/knowledge` : "/knowledge"}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
            >
              <List className="h-3.5 w-3.5" />
              List
            </Link>
            <div className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-background shadow-sm text-foreground">
              <Brain className="h-3.5 w-3.5" />
              Graph
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 pb-3 shrink-0">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="pl-8 h-8 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <Building2 className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All scopes</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="project">Project</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <Filter className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            <SelectItem value="fact">Facts</SelectItem>
            <SelectItem value="decision">Decisions</SelectItem>
            <SelectItem value="procedure">Procedures</SelectItem>
            <SelectItem value="preference">Preferences</SelectItem>
            <SelectItem value="lesson_learned">Lessons</SelectItem>
            <SelectItem value="context">Context</SelectItem>
          </SelectContent>
        </Select>

        {agents && agents.length > 0 && (
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <User className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(scopeFilter !== "__all__" || categoryFilter !== "__all__" || agentFilter !== "__all__") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setScopeFilter("__all__");
              setCategoryFilter("__all__");
              setAgentFilter("__all__");
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Graph canvas + overlays */}
      <div className="relative flex-1 min-h-0">
        <KnowledgeGraphCanvas
          nodes={nodes}
          edges={edges}
          searchTerm={searchQuery}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />

        {/* Legend overlay */}
        <div className="absolute left-4 bottom-4 bg-popover/90 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2.5 z-10">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Node types
          </div>
          <div className="space-y-1.5">
            {LEGEND.map((item) => {
              const Icon = LEGEND_ICON[item.type];
              return (
                <div key={item.type} className="flex items-center gap-2 text-xs text-foreground/80">
                  <Icon className="h-3 w-3" style={{ color: item.color }} />
                  <span>{item.label}</span>
                  <span className="text-muted-foreground tabular-nums ml-auto">
                    {nodes.filter((n) => n.type === item.type).length}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Zoom hint */}
        <div className="absolute left-4 top-4 flex items-center gap-2 text-[10px] text-muted-foreground/60 z-10">
          <ZoomIn className="h-3 w-3" />
          <span>Scroll to zoom &middot; Drag to pan &middot; Click node for details</span>
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            agentMap={agentMap}
            onClose={() => handleSelectNode(null)}
          />
        )}
      </div>
    </div>
  );
}
