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
