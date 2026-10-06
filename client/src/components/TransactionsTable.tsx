import { useMemo, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { Box, Button, Chip, IconButton } from "@mui/material";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  DataGrid,
  type GridColDef, type GridRenderCellParams, type GridRowModel, type GridRowSelectionModel,
} from "@mui/x-data-grid";
import type { TransactionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { canMarkAsSubscription } from "../subscriptions.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

interface TransactionsTableProps {
  rows: TransactionDTO[];
  onCategoryChange: (id: string, category: string) => void;
  onDelete: (ids: string[]) => void;
  onMarkSubscription: (merchant: string) => void;
}

interface MarkSubscriptionButtonProps {
  merchant: string;
  onMark: (merchant: string) => void;
}

const MarkSubscriptionButton = ({ merchant, onMark }: MarkSubscriptionButtonProps) => {
  const mark = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onMark(merchant);
  };

  return (
    <IconButton size="small" aria-label={`Marcar ${merchant} como suscripción`} onClick={mark}>
      <AutorenewOutlinedIcon fontSize="small" />
    </IconButton>
  );
};

export const TransactionsTable = ({ rows, onCategoryChange, onDelete, onMarkSubscription }: TransactionsTableProps) => {
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);

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
    {
      field: "installment", headerName: "Cuota", width: 110, sortable: false, filterable: false,
      renderCell: (params: GridRenderCellParams<TransactionDTO>) => {
        const { isInstallment, installmentCurrent, installmentTotal } = params.row;
        if (!isInstallment) return "—";
        const label = installmentCurrent && installmentTotal
          ? `${installmentCurrent}/${installmentTotal}`
          : "cuota";
        return <Chip size="small" variant="outlined" label={label} />;
      },
    },
    {
      field: "subscription", headerName: "", width: 64, sortable: false, filterable: false, disableColumnMenu: true,
      renderCell: ({ row }: GridRenderCellParams<TransactionDTO>) =>
        (canMarkAsSubscription(row) ? <MarkSubscriptionButton merchant={row.merchant} onMark={onMarkSubscription} /> : null),
    },
  ], [onMarkSubscription]);

  const processRowUpdate = (next: GridRowModel<TransactionDTO>, prev: GridRowModel<TransactionDTO>) => {
    if (next.category !== prev.category) onCategoryChange(next.id, next.category);
    return next;
  };

  const selectedIds = selection.map(String);
  const confirmMessage = pendingIds && pendingIds.length === 1
    ? "¿Borrar este movimiento? Esta acción no se puede deshacer."
    : `¿Borrar ${pendingIds?.length ?? 0} movimientos? Esta acción no se puede deshacer.`;

  const confirmDelete = () => {
    if (pendingIds) onDelete(pendingIds);
    setPendingIds(null);
    setSelection([]);
  };

  return (
    <motion.div
      style={{ width: "100%" }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >

      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        autoHeight
        disableVirtualization
        checkboxSelection
        rowSelectionModel={selection}
        onRowSelectionModelChange={setSelection}
        processRowUpdate={processRowUpdate}
        onProcessRowUpdateError={() => undefined}
        initialState={{ pagination: { paginationModel: { pageSize: 100, page: 0 } } }}
        pageSizeOptions={[25, 50, 100]}
      />
        {selectedIds.length > 0 && (
            <Box sx={{ mb: 1 }}>
                <Button color="error" startIcon={<DeleteIcon />} onClick={() => setPendingIds(selectedIds)}>
                    {`Borrar seleccionados (${selectedIds.length})`}
                </Button>
            </Box>
        )}
      <ConfirmDialog
        open={pendingIds !== null}
        title="Borrar movimientos"
        message={confirmMessage}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={() => setPendingIds(null)}
      />
    </motion.div>
  );
};
