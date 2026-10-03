import { Alert, CircularProgress, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { useDeleteTransactions, usePatchTransaction, useTransactions, type TxFilters } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { useTransactionYearOptions } from "../filters/useYearOptions.js";
import { TransactionsTable } from "../components/TransactionsTable.js";

const TRANSACTION_FIELDS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

export const TransactionsPage = () => {
  const [params] = useSearchParams();
  const patch = usePatchTransaction();
  const del = useDeleteTransactions();
  const filters: TxFilters = {
    currency: (params.get("currency") as "ARS" | "USD") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    category: params.getAll("category"),
    search: params.get("search") ?? undefined,
    cardLabel: params.get("cardLabel") ?? undefined,
    installment: params.get("installment") ?? undefined,
  };
  const { data, isLoading, isError, error } = useTransactions(filters);
  const yearOptions = useTransactionYearOptions(filters.currency ?? "ARS", filters.cardLabel);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Movimientos</Typography>
      <FiltersBar fields={TRANSACTION_FIELDS} yearOptions={yearOptions} />
      <TransactionsTable
        rows={data?.items ?? []}
        onCategoryChange={(id, category) => patch.mutate({ id, body: { category } })}
        onDelete={(ids) => del.mutate(ids)}
      />
    </>
  );
};
