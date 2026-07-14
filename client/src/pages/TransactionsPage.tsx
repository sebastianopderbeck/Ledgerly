import { Alert, CircularProgress, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { usePatchTransaction, useTransactions, type TxFilters } from "../api/hooks.js";
import { FiltersBar } from "../components/FiltersBar.js";
import { TransactionsTable } from "../components/TransactionsTable.js";

export const TransactionsPage = () => {
  const [params] = useSearchParams();
  const patch = usePatchTransaction();
  const filters: TxFilters = {
    currency: (params.get("currency") as "ARS" | "USD") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    category: params.get("category") ?? undefined,
    search: params.get("search") ?? undefined,
    pageSize: 100,
  };
  const { data, isLoading, isError, error } = useTransactions(filters);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Movimientos</Typography>
      <FiltersBar showCategory />
      <TransactionsTable
        rows={data?.items ?? []}
        onCategoryChange={(id, category) => patch.mutate({ id, body: { category } })}
      />
    </>
  );
};
