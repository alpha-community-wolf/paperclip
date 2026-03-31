import type { CostSummary, CostByAgent, CostTrend, CostForecast, CostEfficiencyAgent, CostByModel, CostWaste, CostByProjectEnhanced, BudgetAlertThresholds } from "@paperclipai/shared";
import { api } from "./client";

function dateParams(from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const costsApi = {
  summary: (companyId: string, from?: string, to?: string) =>
    api.get<CostSummary>(`/companies/${companyId}/costs/summary${dateParams(from, to)}`),
  byAgent: (companyId: string, from?: string, to?: string) =>
    api.get<CostByAgent[]>(`/companies/${companyId}/costs/by-agent${dateParams(from, to)}`),
  byProject: (companyId: string, from?: string, to?: string) =>
    api.get<CostByProjectEnhanced[]>(`/companies/${companyId}/costs/by-project${dateParams(from, to)}`),
  trend: (companyId: string, from?: string, to?: string) =>
    api.get<CostTrend>(`/companies/${companyId}/costs/trend${dateParams(from, to)}`),
  forecast: (companyId: string) =>
    api.get<CostForecast & { thresholds: BudgetAlertThresholds }>(`/companies/${companyId}/costs/forecast`),
  efficiency: (companyId: string, from?: string, to?: string) =>
    api.get<CostEfficiencyAgent[]>(`/companies/${companyId}/costs/efficiency${dateParams(from, to)}`),
  byModel: (companyId: string, from?: string, to?: string) =>
    api.get<{ models: CostByModel[] }>(`/companies/${companyId}/costs/by-model${dateParams(from, to)}`),
  waste: (companyId: string, from?: string, to?: string) =>
    api.get<CostWaste>(`/companies/${companyId}/costs/waste${dateParams(from, to)}`),
  getAlertThresholds: (companyId: string) =>
    api.get<BudgetAlertThresholds>(`/companies/${companyId}/costs/alert-thresholds`),
  updateAlertThresholds: (companyId: string, thresholds: BudgetAlertThresholds) =>
    api.patch<BudgetAlertThresholds>(`/companies/${companyId}/costs/alert-thresholds`, thresholds),
};
