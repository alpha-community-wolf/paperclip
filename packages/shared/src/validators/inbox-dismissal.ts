import { z } from "zod";

export const inboxDismissalItemTypeSchema = z.enum(["failed_run", "alert"]);

export const createInboxDismissalSchema = z.object({
  itemType: inboxDismissalItemTypeSchema,
  itemId: z.string().min(1),
});

export const deleteInboxDismissalSchema = z.object({
  itemType: inboxDismissalItemTypeSchema,
  itemId: z.string().min(1),
});

export type CreateInboxDismissal = z.infer<typeof createInboxDismissalSchema>;
export type DeleteInboxDismissal = z.infer<typeof deleteInboxDismissalSchema>;

