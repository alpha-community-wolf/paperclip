import type { Command, CreateCommand, UpdateCommand } from "@paperclipai/shared";
import { api } from "./client";

export const commandsApi = {
  list: (companyId: string) =>
    api.get<Command[]>(`/companies/${encodeURIComponent(companyId)}/commands`),

  create: (companyId: string, data: CreateCommand) =>
    api.post<Command>(`/companies/${encodeURIComponent(companyId)}/commands`, data),

  update: (companyId: string, id: string, data: UpdateCommand) =>
    api.put<Command>(`/companies/${encodeURIComponent(companyId)}/commands/${encodeURIComponent(id)}`, data),

  remove: (companyId: string, id: string) =>
    api.delete<{ ok: boolean }>(`/companies/${encodeURIComponent(companyId)}/commands/${encodeURIComponent(id)}`),
};
