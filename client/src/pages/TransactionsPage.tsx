import { useCallback } from "react";
import { Alert, CircularProgress, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { useDeleteTransactions, usePatchTransaction, useTransactions, type TxFilters } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useTransactionYearOptions } from "../filters/useYearOptions.js";
import { TransactionsList } from "../components/TransactionsList.js";
import { TransactionsTable } from "../components/TransactionsTable.js";
import { useIsMobile } from "../useIsMobile.js";

const TRANSACTION_FIELDS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

export const TransactionsPage = () => {
  const [params] = useSearchParams();
  const { years, currency, cardLabel, from, to } = useGlobalFilters();
  const isMobile = useIsMobile();
  const { mutate: patchTransaction } = usePatchTransaction();
  const { mutate: deleteTransactions } = useDeleteTransactions();
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

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  const Rows = isMobile ? TransactionsList : TransactionsTable;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Movimientos</Typography>
      <FiltersBar fields={TRANSACTION_FIELDS} yearOptions={yearOptions} />
      <Rows rows={data?.items ?? []} onCategoryChange={changeCategory} onDelete={deleteRows} />
    </>
  );
};
