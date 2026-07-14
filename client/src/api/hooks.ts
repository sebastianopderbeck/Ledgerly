import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CategoryRuleDTO, CategoryStat, FutureInstallmentStat, ImportResultDTO,
  MerchantStat, MonthlyStat, StatementDTO, SummaryStat, TransactionDTO,
} from "@ledgerly/shared";
import { apiFetch } from "./client.js";

export interface StatFilters { currency: "ARS" | "USD"; from?: string; to?: string; cardLabel?: string; }

function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function useStatements() {
  return useQuery({ queryKey: ["statements"], queryFn: () => apiFetch<StatementDTO[]>("/statements") });
}

export function useStatementDetail(id: string | null) {
  return useQuery({
    queryKey: ["statement", id],
    queryFn: () => apiFetch<{ statement: StatementDTO; transactions: TransactionDTO[] }>(`/statements/${id}`),
    enabled: Boolean(id),
  });
}

export function useUploadStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, replace }: { file: File; replace?: boolean }) => {
      const form = new FormData();
      form.append("file", file);
      return apiFetch<ImportResultDTO>(`/statements${replace ? "?replace=true" : ""}`, { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/statements/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export interface TxFilters extends Partial<StatFilters> {
  category?: string; issuer?: string; search?: string; page?: number; pageSize?: number;
}

export function useTransactions(filters: TxFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: () =>
      apiFetch<{ items: TransactionDTO[]; total: number; page: number; pageSize: number }>(`/transactions${qs(filters)}`),
  });
}

export function usePatchTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { category?: string; type?: string } }) =>
      apiFetch<TransactionDTO>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useByCategory(f: StatFilters) {
  return useQuery({ queryKey: ["by-category", f], queryFn: () => apiFetch<CategoryStat[]>(`/stats/by-category${qs(f)}`) });
}
export function useMonthly(f: StatFilters) {
  return useQuery({ queryKey: ["monthly", f], queryFn: () => apiFetch<MonthlyStat[]>(`/stats/monthly${qs(f)}`) });
}
export function useTopMerchants(f: StatFilters & { limit?: number }) {
  return useQuery({ queryKey: ["top-merchants", f], queryFn: () => apiFetch<MerchantStat[]>(`/stats/top-merchants${qs(f)}`) });
}
export function useFutureInstallments(f: StatFilters) {
  return useQuery({ queryKey: ["future", f], queryFn: () => apiFetch<FutureInstallmentStat[]>(`/stats/future-installments${qs(f)}`) });
}
export function useSummary(f: StatFilters) {
  return useQuery({ queryKey: ["summary", f], queryFn: () => apiFetch<SummaryStat>(`/stats/summary${qs(f)}`) });
}

export function useCategoryRules() {
  return useQuery({ queryKey: ["rules"], queryFn: () => apiFetch<CategoryRuleDTO[]>("/category-rules") });
}
export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { priority: number; matchType: string; pattern: string; category: string }) =>
      apiFetch<CategoryRuleDTO>("/category-rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
}
export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CategoryRuleDTO> }) =>
      apiFetch<CategoryRuleDTO>(`/category-rules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
}
export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/category-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
}
export function useApplyRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ updated: number }>("/category-rules/apply", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
