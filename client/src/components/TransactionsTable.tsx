import { useMemo } from "react";
import { DataGrid, type GridColDef, type GridRowModel } from "@mui/x-data-grid";
import type { TransactionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";

interface TransactionsTableProps {
  rows: TransactionDTO[];
  onCategoryChange: (id: string, category: string) => void;
}

export const TransactionsTable = ({ rows, onCategoryChange }: TransactionsTableProps) => {
  const columns = useMemo<GridColDef<TransactionDTO>[]>(() => [
    { field: "date", headerName: "Fecha", width: 110 },
    { field: "merchant", headerName: "Comercio", flex: 1, minWidth: 180 },
    { field: "category", headerName: "Categoría", width: 160, editable: true },
    {
      field: "amount", headerName: "Monto", width: 140, type: "number",
      valueGetter: (_v, row) => row.amount,
      valueFormatter: (_v, row) => formatMoney(row.amount, row.currency),
    },
    { field: "type", headerName: "Tipo", width: 110 },
  ], []);

  const processRowUpdate = (next: GridRowModel<TransactionDTO>, prev: GridRowModel<TransactionDTO>) => {
    if (next.category !== prev.category) onCategoryChange(next.id, next.category);
    return next;
  };

  return (
    <div style={{ width: "100%" }}>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        autoHeight
        processRowUpdate={processRowUpdate}
        onProcessRowUpdateError={() => undefined}
        initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
        pageSizeOptions={[25, 50, 100]}
      />
    </div>
  );
};
