import { useMemo, useState } from "react";
import { Chip, IconButton } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { DataGrid, type GridColDef, type GridRenderCellParams } from "@mui/x-data-grid";
import type { ImportedFileDTO } from "@ledgerly/shared";
import { formatLocalDate } from "../format.js";
import { IMPORTED_FILE_KIND_LABELS } from "../importedFiles.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

interface ImportedFilesTableProps {
  rows: ImportedFileDTO[];
  onDelete: (file: ImportedFileDTO) => void;
}

const deleteMessage = (file: ImportedFileDTO | null): string => {
  if (!file) return "";
  const cascade = file.kind === "statement" ? " También se borran sus movimientos." : "";
  return `¿Borrar ${file.fileName}?${cascade} Esta acción no se puede deshacer.`;
};

export const ImportedFilesTable = ({ rows, onDelete }: ImportedFilesTableProps) => {
  const [pending, setPending] = useState<ImportedFileDTO | null>(null);

  const columns = useMemo<GridColDef<ImportedFileDTO>[]>(() => [
    {
      field: "kind", headerName: "Tipo", width: 110,
      valueGetter: (_value, row) => IMPORTED_FILE_KIND_LABELS[row.kind],
      renderCell: (params: GridRenderCellParams<ImportedFileDTO, string>) => (
        <Chip size="small" variant="outlined" label={params.value} />
      ),
    },
    { field: "fileName", headerName: "Archivo", flex: 1, minWidth: 180 },
    { field: "description", headerName: "Detalle", flex: 1, minWidth: 200 },
    {
      field: "documentDate", headerName: "Fecha", width: 120,
      valueFormatter: (value: string | null) => value ?? "—",
    },
    {
      field: "uploadedAt", headerName: "Importado", width: 120,
      valueFormatter: (value: string) => formatLocalDate(value),
    },
    {
      field: "needsReview", headerName: "Estado", width: 110,
      renderCell: (params: GridRenderCellParams<ImportedFileDTO>) =>
        params.row.needsReview ? <Chip label="revisar" color="warning" size="small" /> : null,
    },
    {
      field: "actions", headerName: "", width: 70, sortable: false, filterable: false, disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams<ImportedFileDTO>) => (
        <IconButton aria-label={`borrar ${params.row.fileName}`} onClick={() => setPending(params.row)}>
          <DeleteIcon />
        </IconButton>
      ),
    },
  ], []);

  const confirmDelete = () => {
    if (pending) onDelete(pending);
    setPending(null);
  };

  return (
    <>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        autoHeight
        disableVirtualization
        disableRowSelectionOnClick
        initialState={{
          pagination: { paginationModel: { pageSize: 25, page: 0 } },
          sorting: { sortModel: [{ field: "uploadedAt", sort: "desc" }] },
        }}
        pageSizeOptions={[25, 50, 100]}
        localeText={{ noRowsLabel: "No hay archivos que coincidan con los filtros" }}
      />
      <ConfirmDialog
        open={pending !== null}
        title="Borrar archivo"
        message={deleteMessage(pending)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={() => setPending(null)}
      />
    </>
  );
};
