import { useCallback, useState } from "react";
import { Alert, CircularProgress, Snackbar, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import {
  useDeleteTransactions, useMarkSubscription, usePatchTransaction, useTransactions, type TxFilters,
} from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { snackbarAboveNavSx } from "../components/snackbarSx.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useTransactionYearOptions } from "../filters/useYearOptions.js";
import { TransactionsList } from "../components/TransactionsList.js";
import { TransactionsTable } from "../components/TransactionsTable.js";
import { useIsMobile } from "../useIsMobile.js";

interface MarkFeedback {
  severity: "success" | "error";
  message: string;
}

const TRANSACTION_FIELDS: FilterField[] = ["year", "currency", "card", "month", "transaction"];
const SNACKBAR_ANCHOR = { vertical: "bottom", horizontal: "center" } as const;
const MARKED: MarkFeedback = { severity: "success", message: "Agregado a Suscripciones" };
const MARK_FAILED: MarkFeedback = { severity: "error", message: "No pudimos marcarlo como suscripción" };

export const TransactionsPage = () => {
  const [params] = useSearchParams();
  const { years, currency, cardLabel, from, to } = useGlobalFilters();
  const isMobile = useIsMobile();
  const { mutate: patchTransaction } = usePatchTransaction();
  const { mutate: deleteTransactions } = useDeleteTransactions();
  const { mutate: markSubscription } = useMarkSubscription();
  const [feedback, setFeedback] = useState<MarkFeedback | null>(null);
  const filters: TxFilters = {
    currency: params.get("currency") === null ? undefined : currency,
    from,
    to,
    year: years,
    category: params.getAll("category"),
    search: params.get("search") ?? undefined,
    cardLabel,
    installment: params.get("installment") ?? undefined,
  };
  const { data, isLoading, isError, error } = useTransactions(filters);
  const yearOptions = useTransactionYearOptions(currency, cardLabel);

  const changeCategory = useCallback(
    (id: string, category: string) => patchTransaction({ id, body: { category } }),
    [patchTransaction],
  );
  const deleteRows = useCallback((ids: string[]) => deleteTransactions(ids), [deleteTransactions]);
  const markAsSubscription = useCallback((transactionId: string) => markSubscription(transactionId, {
    onSuccess: () => setFeedback(MARKED),
    onError: () => setFeedback(MARK_FAILED),
  }), [markSubscription]);
  const dismissFeedback = useCallback(() => setFeedback(null), []);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  const Rows = isMobile ? TransactionsList : TransactionsTable;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Movimientos</Typography>
      <FiltersBar fields={TRANSACTION_FIELDS} yearOptions={yearOptions} />
      <Rows
        rows={data?.items ?? []}
        onCategoryChange={changeCategory}
        onDelete={deleteRows}
        onMarkSubscription={markAsSubscription}
      />
      <Snackbar
        open={feedback !== null}
        autoHideDuration={6000}
        onClose={dismissFeedback}
        sx={snackbarAboveNavSx}
        anchorOrigin={SNACKBAR_ANCHOR}
      >
        {feedback ? <Alert severity={feedback.severity} onClose={dismissFeedback}>{feedback.message}</Alert> : undefined}
      </Snackbar>
    </>
  );
};
