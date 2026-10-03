import { useCallback, useMemo, useState } from "react";
import { Box, Chip, IconButton, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { ImportedFileDTO } from "@ledgerly/shared";
import { formatLocalDate } from "../format.js";
import { IMPORTED_FILE_KIND_LABELS, importedFileDeleteMessage } from "../importedFiles.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { iconTapTargetSx } from "./tapTarget.js";

interface ImportedFileCardsProps {
  rows: ImportedFileDTO[];
  onDelete: (file: ImportedFileDTO) => void;
}

interface FileBadgesProps {
  file: ImportedFileDTO;
}

const NO_DETAILS: RecordField[] = [];

const newestFirst = (a: ImportedFileDTO, b: ImportedFileDTO): number => b.uploadedAt.localeCompare(a.uploadedAt);

const highlightsOf = (file: ImportedFileDTO): RecordField[] => [
  { label: "Fecha", value: file.documentDate ?? "—" },
  { label: "Importado", value: formatLocalDate(file.uploadedAt) },
];

const FileBadges = ({ file }: FileBadgesProps) => (
  <>
    <Chip size="small" variant="outlined" label={IMPORTED_FILE_KIND_LABELS[file.kind]} />
    {file.needsReview && <Chip size="small" color="warning" label="revisar" />}
  </>
);

export const ImportedFileCards = ({ rows, onDelete }: ImportedFileCardsProps) => {
  const [pending, setPending] = useState<ImportedFileDTO | null>(null);
  const sorted = useMemo(() => [...rows].sort(newestFirst), [rows]);
  const cancelDelete = useCallback(() => setPending(null), []);

  const confirmDelete = () => {
    if (pending) onDelete(pending);
    setPending(null);
  };

  if (sorted.length === 0) {
    return <Typography color="text.secondary">No hay archivos que coincidan con los filtros</Typography>;
  }

  const cards = sorted.map((file) => (
    <RecordCard
      key={file.id}
      title={file.fileName}
      meta={file.description}
      badge={<FileBadges file={file} />}
      action={(
        <IconButton edge="end" aria-label={`borrar ${file.fileName}`} onClick={() => setPending(file)} sx={iconTapTargetSx}>
          <DeleteIcon />
        </IconButton>
      )}
      highlights={highlightsOf(file)}
      details={NO_DETAILS}
    />
  ));

  return (
    <>
      <Box sx={recordListSx}>{cards}</Box>
      <ConfirmDialog
        open={pending !== null}
        title="Borrar archivo"
        message={importedFileDeleteMessage(pending)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
    </>
  );
};
