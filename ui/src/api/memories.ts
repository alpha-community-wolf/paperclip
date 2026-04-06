import { api } from "./client";

export interface SharedMemory {
  id: string;
  companyId: string;
  scope: "company" | "project";
  projectId: string | null;
  content: string;
  category: "fact" | "decision" | "procedure" | "preference" | "lesson_learned" | "context";
  tags: string[];
  sourceAgentId: string | null;
  sourceIssueId: string | null;
  sourceRunId: string | null;
  sourceType: "agent_save" | "auto_capture" | "manual" | "propagated";
  confidence: number;
  verifiedByAgentId: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  supersededBy: string | null;
  status: "active" | "superseded" | "disputed" | "archived";
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryListResponse {
  memories: SharedMemory[];
  total: number;
}

export interface MemorySearchResponse extends MemoryListResponse {
  query: string;
}

export interface MemoryConflict {
  id_a: string;
  id_b: string;
  content_a: string;
  content_b: string;
  agent_a: string | null;
  agent_b: string | null;
  category: string;
}

export interface MemoryConflictsResponse {
  conflicts: MemoryConflict[];
  total: number;
}

export interface MemoryFilters {
  q?: string;
  scope?: "company" | "project";
  projectId?: string;
  category?: string;
  status?: string;
  tags?: string;
  limit?: number;
  offset?: number;
}

export interface KnowledgeSynthesisResult {
  duplicatesMerged: number;
  staleMemoriesFlagged: number;
  memoriesPromoted: number;
  conflictsDetected: number;
  indexUpdated: boolean;
}

export interface OnboardingBriefing {
  briefing: string;
  memoriesUsed: number;
  generatedAt: string;
}

export const memoriesApi = {
  list: (companyId: string, filters?: MemoryFilters) => {
    const params = new URLSearchParams();
    if (filters?.q) params.set("q", filters.q);
    if (filters?.scope) params.set("scope", filters.scope);
    if (filters?.projectId) params.set("projectId", filters.projectId);
    if (filters?.category) params.set("category", filters.category);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.tags) params.set("tags", filters.tags);
    if (filters?.limit) params.set("limit", String(filters.limit));
    if (filters?.offset) params.set("offset", String(filters.offset));
    const qs = params.toString();
    return api.get<MemoryListResponse>(`/companies/${companyId}/memories${qs ? `?${qs}` : ""}`);
  },

  search: (companyId: string, q: string, filters?: Omit<MemoryFilters, "q">) => {
    const params = new URLSearchParams({ q });
    if (filters?.scope) params.set("scope", filters.scope);
    if (filters?.projectId) params.set("projectId", filters.projectId);
    if (filters?.category) params.set("category", filters.category);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.tags) params.set("tags", filters.tags);
    if (filters?.limit) params.set("limit", String(filters.limit));
    if (filters?.offset) params.set("offset", String(filters.offset));
    return api.get<MemorySearchResponse>(`/companies/${companyId}/memories/search?${params}`);
  },

  get: (id: string) => api.get<SharedMemory>(`/memories/${id}`),

  update: (id: string, data: Partial<Pick<SharedMemory, "content" | "category" | "tags" | "confidence" | "status" | "supersededBy" | "expiresAt">>) =>
    api.patch<SharedMemory>(`/memories/${id}`, data),

  archive: (id: string) => api.delete<SharedMemory>(`/memories/${id}`),

  verify: (id: string, agentId: string) =>
    api.post<SharedMemory>(`/memories/${id}/verify`, { agentId }),

  duplicates: (id: string) =>
    api.get<{ duplicates: SharedMemory[]; total: number }>(`/memories/${id}/duplicates`),

  conflicts: (companyId: string, limit?: number) => {
    const params = limit ? `?limit=${limit}` : "";
    return api.get<MemoryConflictsResponse>(`/companies/${companyId}/memories/conflicts${params}`);
  },

  dispute: (companyId: string, memoryIdA: string, memoryIdB: string) =>
    api.post<{ idA: string; idB: string }>(
      `/companies/${companyId}/memories/conflicts/dispute`,
      { memoryIdA, memoryIdB },
    ),

  triggerDecay: (companyId: string) =>
    api.post<{ expired: number; decayed: number }>(`/companies/${companyId}/memories/decay`, {}),

  triggerSynthesis: (companyId: string) =>
    api.post<KnowledgeSynthesisResult>(`/companies/${companyId}/memories/synthesis`, {}),

  onboardingBriefing: (companyId: string) =>
    api.get<OnboardingBriefing>(`/companies/${companyId}/memories/onboarding-briefing`),
};
