import { useCallback } from "react";
import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import type { StatementDTO } from "@ledgerly/shared";
import { useMarkFindingsReviewed, useStatementReview } from "../api/hooks.js";
import { StatementReviewChecklist } from "./StatementReviewChecklist.js";
import { StatementReviewPicker } from "./StatementReviewPicker.js";
import { useStatementReviewPicker } from "./useStatementReviewPicker.js";

export interface StatementReviewSectionProps {
  focusStatement?: StatementDTO | null;
}

interface SelectedReviewProps {
  statementId: string | null;
  onMark: (keys: string[], reviewed: boolean) => void;
}

const Spinner = () => (
  <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
    <CircularProgress size={24} />
  </Box>
);

const SelectedReview = ({ statementId, onMark }: SelectedReviewProps) => {
  const { data, isLoading, error } = useStatementReview(statementId);
  if (isLoading) return <Spinner />;
  if (error) return <Alert severity="error">{`No se pudo cargar la revisión: ${error.message}`}</Alert>;
  if (!data) return null;
  return <StatementReviewChecklist review={data} onMark={onMark} />;
};

export const StatementReviewSection = ({ focusStatement = null }: StatementReviewSectionProps) => {
  const { isLoading, error, options, selectedId, select } = useStatementReviewPicker(focusStatement);
  const { mutate, error: markError } = useMarkFindingsReviewed();
  const handleMark = useCallback((keys: string[], reviewed: boolean) => {
    if (selectedId) mutate({ statementId: selectedId, keys, reviewed });
  }, [mutate, selectedId]);

  if (isLoading) return <Spinner />;
  if (error) return <Alert severity="error" sx={{ mt: 4 }}>{`No se pudieron cargar los resúmenes: ${error.message}`}</Alert>;
  if (options.length === 0) return null;

  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>Revisión antes de pagar</Typography>
      <StatementReviewPicker options={options} selectedId={selectedId} onSelect={select} />
      {markError && (
        <Alert severity="error" sx={{ mb: 2 }}>{`No se pudo guardar la revisión: ${markError.message}`}</Alert>
      )}
      <SelectedReview statementId={selectedId} onMark={handleMark} />
    </>
  );
};
