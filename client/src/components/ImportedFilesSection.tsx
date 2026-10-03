import { Alert, CircularProgress, Typography } from "@mui/material";
import type { ImportedFileDTO } from "@ledgerly/shared";
import { useDeleteImportedFile, useImportedFiles } from "../api/hooks.js";
import { useImportedFilesFilters } from "../filters/useImportedFilesFilters.js";
import { ImportedFilesFilters } from "./ImportedFilesFilters.js";
import { ImportedFilesTable } from "./ImportedFilesTable.js";

const NO_FILES: ImportedFileDTO[] = [];

export const ImportedFilesSection = () => {
  const { data, isLoading, isError, error } = useImportedFiles();
  const remove = useDeleteImportedFile();
  const files = data ?? NO_FILES;
  const { filters, updateFilters, visibleFiles, yearOptions } = useImportedFilesFilters(files);

  if (isLoading) return <CircularProgress size={24} />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;
  if (files.length === 0) return <Typography color="text.secondary">Todavía no importaste archivos.</Typography>;

  return (
    <>
      <ImportedFilesFilters filters={filters} yearOptions={yearOptions} onChange={updateFilters} />
      {remove.isError && <Alert severity="error" sx={{ mb: 2 }}>{remove.error.message}</Alert>}
      <ImportedFilesTable rows={visibleFiles} onDelete={remove.mutate} />
    </>
  );
};
