import { z } from "zod";

export const patchInstanceNetworkSchema = z.object({
  allowedHostnames: z.array(z.string().min(1).max(253)).max(100),
});

export type PatchInstanceNetwork = z.infer<typeof patchInstanceNetworkSchema>;
