import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface ResolvedFile {
  resolved: true;
  agentId: string;
  agentName: string;
  agentUrlKey: string;
  relativePath: string;
}

export interface UnresolvedFile {
  resolved: false;
  candidates: Array<{
    agentId: string;
    agentName: string;
    agentUrlKey: string;
    relativePath: string;
  }>;
}

export type ResolveResult = ResolvedFile | UnresolvedFile;

const STALE_TIME = 5 * 60 * 1000; // 5 minutes — matches server TTL

export interface BacklinkEntry {
  sourceAgentId: string;
  sourceAgentName: string;
  sourceAgentUrlKey: string;
  sourceRelativePath: string;
  targetName: string;
  contextSnippet: string;
}

export function useBacklinks(
  companyId: string | null | undefined,
  /** Full relative path or just filename — extension stripped automatically */
  filePath: string | null | undefined,
) {
  // Strip extension for the lookup key
  const filename = filePath
    ? filePath.split("/").pop()?.replace(/\.(md|mdx|markdown)$/i, "") ?? filePath
    : null;

  return useQuery<BacklinkEntry[]>({
    queryKey: ["file-index", "backlinks", companyId, filename],
    queryFn: () =>
      api.get<BacklinkEntry[]>(
        `/companies/${companyId}/file-index/backlinks?filename=${encodeURIComponent(filename!)}`,
      ),
    enabled: !!companyId && !!filename,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// File graph
// ---------------------------------------------------------------------------

export interface FileGraphNode {
  id: string;
  label: string;
  type: "file";
  agentId: string;
  agentName: string;
  agentUrlKey: string;
  relativePath: string;
  backlinkCount: number;
}

export interface FileGraphEdge {
  id: string;
  source: string;
  target: string;
  edgeType: "wikilink";
}

export interface FileGraphData {
  nodes: FileGraphNode[];
  edges: FileGraphEdge[];
}

export function useFileGraph(
  companyId: string | null | undefined,
  options?: { agentId?: string; minLinks?: number },
) {
  const params = new URLSearchParams();
  if (options?.agentId) params.set("agentId", options.agentId);
  if (options?.minLinks && options.minLinks > 0) params.set("minLinks", String(options.minLinks));
  const query = params.toString();

  return useQuery<FileGraphData>({
    queryKey: ["file-index", "graph", companyId, options?.agentId ?? null, options?.minLinks ?? 0],
    queryFn: () =>
      api.get<FileGraphData>(
        `/companies/${companyId}/file-index/graph${query ? `?${query}` : ""}`,
      ),
    enabled: !!companyId,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: false,
  });
}

export function useWikiLinkResolve(
  companyId: string | null | undefined,
  name: string,
  scope?: string,
) {
  return useQuery<ResolveResult>({
    queryKey: ["file-index", "resolve", companyId, name, scope ?? null],
    queryFn: () => {
      const params = new URLSearchParams({ name });
      if (scope) params.set("scope", scope);
      return api.get<ResolveResult>(
        `/companies/${companyId}/file-index/resolve?${params.toString()}`,
      );
    },
    enabled: !!companyId && !!name,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: false,
  });
}
