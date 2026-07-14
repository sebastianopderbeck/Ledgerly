import { useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import type { ImportResultDTO } from "@ledgerly/shared";
import { useDeleteStatement, useStatements, useUploadStatement } from "../api/hooks.js";
import { FileDropzone } from "../components/FileDropzone.js";
import { ReconciliationBanner } from "../components/ReconciliationBanner.js";
import { StatementList } from "../components/StatementList.js";

export const ImportPage = () => {
  const upload = useUploadStatement();
  const del = useDeleteStatement();
  const statements = useStatements();
  const [last, setLast] = useState<ImportResultDTO | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const handleFile = (file: File) => {
    setLastFile(file);
    upload.mutate({ file }, { onSuccess: setLast });
  };

  const handleReplace = () => {
    if (lastFile) upload.mutate({ file: lastFile, replace: true }, { onSuccess: setLast });
  };

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Importar resumen</Typography>
      <FileDropzone onFile={handleFile} disabled={upload.isPending} />

      {upload.isPending && <Box sx={{ display: "flex", gap: 1, mb: 2 }}><CircularProgress size={20} /> Procesando…</Box>}
      {upload.isError && <Alert severity="error" sx={{ mb: 2 }}>{upload.error.message}</Alert>}
      {last && (
        <>
          <Alert
            severity={last.status === "duplicate" ? "info" : "success"}
            sx={{ mb: 2 }}
            action={last.status === "duplicate" ? (
              <Button color="inherit" size="small" onClick={handleReplace} disabled={upload.isPending}>
                Reemplazar
              </Button>
            ) : undefined}
          >
            {last.status === "duplicate" ? "Ya estaba importado" : `Importado: ${last.transactionCount} movimientos`}
          </Alert>
          <ReconciliationBanner reconciliation={last.statement.reconciliation} />
        </>
      )}

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Resúmenes importados</Typography>
      {statements.data && <StatementList statements={statements.data} onDelete={(id) => del.mutate(id)} />}
    </>
  );
};
