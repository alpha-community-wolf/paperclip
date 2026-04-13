import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { issuesApi, type IssueListFilters } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";

const ISSUE_PAGE_SIZE = 100;

function toQueryKeyFilters(filters?: IssueListFilters): Record<string, string | undefined> | undefined {
  if (!filters) return undefined;
  return {
    status: filters.status,
    projectId: filters.projectId,
    assigneeAgentId: filters.assigneeAgentId,
    assigneeUserId: filters.assigneeUserId,
    touchedByUserId: filters.touchedByUserId,
    unreadForUserId: filters.unreadForUserId,
    reviewerAgentId: filters.reviewerAgentId,
    approverAgentId: filters.approverAgentId,
    labelId: filters.labelId,
    q: filters.q,
  };
}

export function usePaginatedIssues(
  companyId: string | undefined,
  filters?: IssueListFilters,
  enabled: boolean = true,
): {
  issues: Issue[];
  isLoading: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
} {
  const query = useInfiniteQuery({
    queryKey: companyId ? queryKeys.issues.paged(companyId, toQueryKeyFilters(filters)) : ["issues", "paged", "disabled"],
    queryFn: ({ pageParam }) =>
      issuesApi.listPage(companyId!, filters, {
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit: ISSUE_PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(companyId) && enabled,
  });

  const issues = useMemo(
    () => query.data?.pages.flatMap((page) => page.issues) ?? [],
    [query.data],
  );

  return {
    issues,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
