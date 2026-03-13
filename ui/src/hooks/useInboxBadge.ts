import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sidebarBadgesApi } from "../api/sidebarBadges";
import { inboxDismissalsApi } from "../api/inboxDismissals";
import { queryKeys } from "../lib/queryKeys";
import {
  loadDismissedInboxItems,
  saveDismissedInboxItems,
} from "../lib/inbox";

function parseDismissedKey(key: string): { itemType: "failed_run" | "alert"; itemId: string } | null {
  if (key.startsWith("run:")) {
    const itemId = key.slice("run:".length).trim();
    return itemId ? { itemType: "failed_run", itemId } : null;
  }
  if (key.startsWith("alert:")) {
    const itemId = key.slice("alert:".length).trim();
    return itemId ? { itemType: "alert", itemId } : null;
  }
  return null;
}

export function useDismissedInboxItems(companyId?: string | null) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissedInboxItems);

  const { data: persistedDismissals = [] } = useQuery({
    queryKey: companyId ? queryKeys.inboxDismissals(companyId) : ["inbox-dismissals", "none"],
    queryFn: () => inboxDismissalsApi.list(companyId!),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    if (!companyId) return;
    const merged = new Set(loadDismissedInboxItems());
    for (const row of persistedDismissals) {
      merged.add(row.itemType === "failed_run" ? `run:${row.itemId}` : `alert:${row.itemId}`);
    }
    saveDismissedInboxItems(merged);
    setDismissed(merged);
  }, [companyId, persistedDismissals]);

  const persistDismiss = useMutation({
    onMutate: (key) => {
      if (!companyId) return;
      queryClient.setQueryData(queryKeys.sidebarBadges(companyId), (current: any) => {
        if (!current || typeof current !== "object") return current;
        if (key.startsWith("run:")) {
          const failedRuns = Math.max(0, Number(current.failedRuns ?? 0) - 1);
          const inbox = Math.max(0, Number(current.inbox ?? 0) - 1);
          return { ...current, failedRuns, inbox };
        }
        if (key.startsWith("alert:")) {
          const alerts = Math.max(0, Number(current.alerts ?? 0) - 1);
          const inbox = Math.max(0, Number(current.inbox ?? 0) - 1);
          return { ...current, alerts, inbox };
        }
        return current;
      });
    },
    mutationFn: async (key: string) => {
      if (!companyId) return null;
      const parsed = parseDismissedKey(key);
      if (!parsed) return null;
      return inboxDismissalsApi.dismiss(companyId, parsed.itemType, parsed.itemId);
    },
    onSettled: () => {
      if (!companyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxDismissals(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(companyId) });
    },
  });

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "paperclip:inbox:dismissed") return;
      setDismissed(loadDismissedInboxItems());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissedInboxItems(next);
      return next;
    });
    if (companyId) persistDismiss.mutate(id);
  };

  return { dismissed, dismiss };
}

export function useInboxBadge(companyId: string | null | undefined) {
  useDismissedInboxItems(companyId);
  const { data } = useQuery({
    queryKey: queryKeys.sidebarBadges(companyId!),
    queryFn: () => sidebarBadgesApi.get(companyId!),
    enabled: !!companyId,
    refetchInterval: 15_000,
  });
  return data ?? {
    inbox: 0,
    approvals: 0,
    failedRuns: 0,
    joinRequests: 0,
    unreadTouchedIssues: 0,
    alerts: 0,
  };
}
