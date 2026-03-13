import type { InboxDismissal, InboxDismissalItemType } from "@paperclipai/shared";
import { api } from "./client";

export const inboxDismissalsApi = {
  list: (companyId: string) => api.get<InboxDismissal[]>(`/companies/${companyId}/inbox-dismissals`),
  dismiss: (companyId: string, itemType: InboxDismissalItemType, itemId: string) =>
    api.post<InboxDismissal>(`/companies/${companyId}/inbox-dismissals`, { itemType, itemId }),
};

