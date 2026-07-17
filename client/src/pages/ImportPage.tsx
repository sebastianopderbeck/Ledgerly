import { useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import type { ImportResultUnionDTO } from "@ledgerly/shared";
import { useDeleteStatement, useStatements, useImportFile } from "../api/hooks.js";
import { FileDropzone } from "../components/FileDropzone.js";
import { ReconciliationBanner } from "../components/ReconciliationBanner.js";
import { StatementList } from "../components/StatementList.js";

export const ImportPage = () => {
  const upload = useImportFile();
  const del = useDeleteStatement();
  const statements = useStatements();
  const [last, setLast] = useState<ImportResultUnionDTO | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const handleFile = (file: File) => {
    setLastFile(file);
    upload.mutate({ file }, { onSuccess: setLast });
  };

  const handleReplace = () => {
    if (lastFile) upload.mutate({ file: lastFile, replace: true }, { onSuccess: setLast });
  };

  const replaceAction = (
    <Button color="inherit" size="small" onClick={handleReplace} disabled={upload.isPending}>
      Reemplazar
    </Button>
  );

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Importar resumen</Typography>
      <FileDropzone onFile={handleFile} disabled={upload.isPending} />

      {upload.isPending && <Box sx={{ display: "flex", gap: 1, mb: 2 }}><CircularProgress size={20} /> Procesando…</Box>}
      {upload.isError && <Alert severity="error" sx={{ mb: 2 }}>{upload.error.message}</Alert>}

      {last && last.kind === "statement" && (
        <>
          <Alert
            severity={last.status === "duplicate" ? "info" : "success"}
            sx={{ mb: 2 }}
            action={last.status === "duplicate" ? replaceAction : undefined}
          >
            {last.status === "duplicate" ? "Ya estaba importado" : `Importado: ${last.transactionCount} movimientos`}
          </Alert>
          <ReconciliationBanner reconciliation={last.statement.reconciliation} />
        </>
      )}

      {last && last.kind === "coupon" && (
        <Alert
          severity={last.status === "duplicate" ? "info" : "success"}
          sx={{ mb: 2 }}
          action={last.status === "duplicate" ? replaceAction : undefined}
        >
          {last.status === "duplicate"
            ? "Ese cupón ya estaba importado"
            : `Importado: cuota ${last.coupon.cuotaNro} del crédito`}
        </Alert>
      )}

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Resúmenes importados</Typography>
      {statements.data && <StatementList statements={statements.data} onDelete={(id) => del.mutate(id)} />}
    </>
  );
};
