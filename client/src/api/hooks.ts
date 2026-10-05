import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutoCouponDTO, AutoSummaryDTO, BudgetDTO, BudgetInput, BudgetPatch, BudgetSpendingDTO, CashFlowDTO, CategoryRuleDTO, CategoryStat,
  CreditSummaryDTO, FutureInstallmentStat, FutureInstallmentMonth, GmailStatusDTO, MailSyncRunDTO, ImportResultUnionDTO,
  ImportedFileDTO, InboxRuleResultDTO, InflationRateDTO, InstallmentPurchaseDTO, MacroRefreshDTO, MacroSeriesDTO,
  ManualAssetCreateDTO, ManualAssetDTO, ManualAssetUpdateDTO, MerchantStat, MonthlyStat, MonthlyUsdStat, MortgageCouponDTO,
  NetWorthDTO, OficialRateDTO, PayslipDTO, PayslipSummaryDTO, StatementDTO, StatementReviewDTO, StatementReviewKeysDTO,
  SubscriptionsReportDTO, SummaryStat, TransactionDTO, UncategorizedInboxDTO,
} from "@ledgerly/shared";
import { applyReviewedDelta } from "../statementReview.js";
import { apiFetch } from "./client.js";

export interface StatFilters { currency: "ARS" | "USD"; from?: string; to?: string; cardLabel?: string; year?: string[]; }

function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null && item !== "") sp.append(k, String(item));
      }
    } else if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
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

export function useImportFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, replace }: { file: File; replace?: boolean }) => {
      const form = new FormData();
      form.append("file", file);
      return apiFetch<ImportResultUnionDTO>(`/import${replace ? "?replace=true" : ""}`, { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useImportedFiles() {
  return useQuery({ queryKey: ["imports"], queryFn: () => apiFetch<ImportedFileDTO[]>("/imports") });
}

export function useDeleteImportedFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: Pick<ImportedFileDTO, "kind" | "id">) =>
      apiFetch<void>(`/imports/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export interface TxFilters extends Partial<StatFilters> {
  category?: string[]; issuer?: string; search?: string; installment?: string; page?: number; pageSize?: number;
}

export function useTransactions(filters: TxFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiFetch<{ items: TransactionDTO[]; total: number; page: number; pageSize: number }>(`/transactions${qs(filters)}`),
  });
}

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => apiFetch<string[]>("/transactions/categories") });
}

export function usePatchTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { category?: string; type?: string } }) =>
      apiFetch<TransactionDTO>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ deleted: number }>("/transactions/delete", { method: "POST", body: JSON.stringify({ ids }) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useByCategory(f: StatFilters) {
  return useQuery({ queryKey: ["by-category", f], queryFn: () => apiFetch<CategoryStat[]>(`/stats/by-category${qs(f)}`) });
}
export function useByCategoryLastStatement(f: StatFilters) {
  return useQuery({
    queryKey: ["by-category-last-statement", f.currency, f.cardLabel],
    queryFn: () => apiFetch<CategoryStat[]>(`/stats/last-statement/by-category${qs({ currency: f.currency, cardLabel: f.cardLabel })}`),
  });
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

export function useFutureInstallmentsDetail(f: StatFilters) {
  return useQuery({ queryKey: ["future-detail", f], queryFn: () => apiFetch<FutureInstallmentMonth[]>(`/stats/future-installments/detail${qs(f)}`) });
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

export function useCreditCoupons() {
  return useQuery({ queryKey: ["credit-coupons"], queryFn: () => apiFetch<MortgageCouponDTO[]>("/credits/coupons") });
}
export function useCreditSummary() {
  return useQuery({ queryKey: ["credit-summary"], queryFn: () => apiFetch<CreditSummaryDTO>("/credits/summary") });
}
export function usePatchCouponRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipoCambioUsd }: { id: string; tipoCambioUsd: number }) =>
      apiFetch<MortgageCouponDTO>(`/credits/coupons/${id}`, { method: "PATCH", body: JSON.stringify({ tipoCambioUsd }) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useOficialRate() {
  return useQuery({ queryKey: ["fx-oficial"], queryFn: () => apiFetch<OficialRateDTO>("/fx/oficial"), staleTime: 1000 * 60 * 60 });
}
export function useMonthlyUsd(f: StatFilters) {
  return useQuery({ queryKey: ["monthly-usd", f], queryFn: () => apiFetch<MonthlyUsdStat[]>(`/stats/monthly-usd${qs(f)}`), staleTime: 1000 * 60 * 60 });
}
export function useInflation() {
  return useQuery({ queryKey: ["inflation"], queryFn: () => apiFetch<InflationRateDTO[]>("/inflation"), staleTime: 1000 * 60 * 60 });
}
export function useMacroSeries() {
  return useQuery({ queryKey: ["macro-series"], queryFn: () => apiFetch<MacroSeriesDTO>("/macro/series"), staleTime: 1000 * 60 * 60 });
}

export function useRefreshMacro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<MacroRefreshDTO>("/macro/refresh", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useAutoCoupons() {
  return useQuery({ queryKey: ["auto-coupons"], queryFn: () => apiFetch<AutoCouponDTO[]>("/auto/coupons") });
}
export function useAutoSummary() {
  return useQuery({ queryKey: ["auto-summary"], queryFn: () => apiFetch<AutoSummaryDTO>("/auto/summary") });
}
export function usePatchAutoRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipoCambioUsd }: { id: string; tipoCambioUsd: number }) =>
      apiFetch<AutoCouponDTO>(`/auto/coupons/${id}`, { method: "PATCH", body: JSON.stringify({ tipoCambioUsd }) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function usePayslips() {
  return useQuery({ queryKey: ["payslips"], queryFn: () => apiFetch<PayslipDTO[]>("/payslips") });
}
export function usePayslipSummary() {
  return useQuery({ queryKey: ["payslip-summary"], queryFn: () => apiFetch<PayslipSummaryDTO>("/payslips/summary") });
}
export function usePatchPayslipRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipoCambioUsd }: { id: string; tipoCambioUsd: number }) =>
      apiFetch<PayslipDTO>(`/payslips/${id}`, { method: "PATCH", body: JSON.stringify({ tipoCambioUsd }) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCashFlow() {
  return useQuery({ queryKey: ["cash-flow"], queryFn: () => apiFetch<CashFlowDTO>("/cash-flow") });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => apiFetch<SubscriptionsReportDTO>("/subscriptions"),
    staleTime: 1000 * 60 * 60,
  });
}

export function useSetSubscriptionHidden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, hidden }: { key: string; hidden: boolean }) =>
      apiFetch<void>(`/subscriptions/hidden/${encodeURIComponent(key)}`, { method: hidden ? "PUT" : "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export const statementReviewKey = (id: string | null) => ["statement-review", id] as const;

const fetchStatementReview = (id: string) => apiFetch<StatementReviewDTO>(`/statements/${id}/review`);

export function useStatementReview(id: string | null) {
  return useQuery({
    queryKey: statementReviewKey(id),
    queryFn: () => fetchStatementReview(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useStatementReviews(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({ queryKey: statementReviewKey(id), queryFn: () => fetchStatementReview(id) })),
  });
}

export interface MarkFindingsReviewedInput { statementId: string; keys: string[]; reviewed: boolean; }

export function useMarkFindingsReviewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ statementId, keys, reviewed }: MarkFindingsReviewedInput) =>
      apiFetch<StatementReviewKeysDTO>(`/statements/${statementId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ keys, reviewed }),
      }),
    onMutate: ({ statementId, keys, reviewed }: MarkFindingsReviewedInput) => {
      qc.setQueryData<StatementReviewDTO>(statementReviewKey(statementId), (previous) =>
        previous && { ...previous, reviewedKeys: applyReviewedDelta(previous.reviewedKeys, keys, reviewed) });
    },
    onError: (_error, { statementId }) => qc.invalidateQueries({ queryKey: statementReviewKey(statementId) }),
  });
}

export function useInstallmentPurchases(f: Pick<StatFilters, "cardLabel" | "year">) {
  return useQuery({
    queryKey: ["installment-purchases", f],
    queryFn: () => apiFetch<InstallmentPurchaseDTO[]>(`/stats/installment-purchases${qs(f)}`),
  });
}

export function useNetWorth() {
  return useQuery({
    queryKey: ["net-worth"],
    queryFn: async () => (await apiFetch<NetWorthDTO | undefined>("/net-worth")) ?? null,
  });
}

export function useCreateManualAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ManualAssetCreateDTO) =>
      apiFetch<ManualAssetDTO>("/net-worth/assets", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["net-worth"] }),
  });
}

export function useUpdateManualAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ManualAssetUpdateDTO }) =>
      apiFetch<ManualAssetDTO>(`/net-worth/assets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["net-worth"] }),
  });
}

export function useDeleteManualAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/net-worth/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["net-worth"] }),
  });
}

export function useDeleteAssetValuation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fecha }: { id: string; fecha: string }) =>
      apiFetch<ManualAssetDTO>(`/net-worth/assets/${id}/valuations/${fecha}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["net-worth"] }),
  });
}

export function useBudgets() {
  return useQuery({ queryKey: ["budgets"], queryFn: () => apiFetch<BudgetDTO[]>("/budgets") });
}

export function useBudgetSpending(years: string[] | undefined) {
  return useQuery({
    queryKey: ["budget-spending", years],
    queryFn: () => apiFetch<BudgetSpendingDTO>(`/budgets/spending${qs({ year: years })}`),
  });
}

export function useCreateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BudgetInput) => apiFetch<BudgetDTO>("/budgets", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });
}

export function useUpdateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: BudgetPatch }) =>
      apiFetch<BudgetDTO>(`/budgets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/budgets/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });
}

export function useUncategorizedInbox() {
  return useQuery({ queryKey: ["rules-inbox"], queryFn: () => apiFetch<UncategorizedInboxDTO>("/category-rules/inbox") });
}

export function useCreateInboxRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { pattern: string; category: string }) =>
      apiFetch<InboxRuleResultDTO>("/category-rules/inbox/rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useGmailStatus() {
  return useQuery({ queryKey: ["gmail-status"], queryFn: () => apiFetch<GmailStatusDTO>("/gmail/status") });
}

export function useGmailSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<MailSyncRunDTO>("/gmail/sync", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
