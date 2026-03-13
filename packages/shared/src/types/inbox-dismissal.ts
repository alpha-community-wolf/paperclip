export type InboxDismissalItemType = "failed_run" | "alert";

export interface InboxDismissal {
  id: string;
  companyId: string;
  userId: string;
  itemType: InboxDismissalItemType;
  itemId: string;
  createdAt: Date;
  updatedAt: Date;
}

