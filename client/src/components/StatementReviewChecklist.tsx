import { useCallback, useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, Chip, LinearProgress, List, Typography, type ChipProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import type { StatementReviewDTO } from "@ledgerly/shared";
import {
  REVIEW_CHECK_COLORS,
  historyCaption,
  reviewCheckSummary,
  reviewProgress,
  splitFindings,
  statementCaption,
  type ReviewCheckSummary,
} from "../statementReview.js";
import { useIsMobile } from "../useIsMobile.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";
import { ReconciliationBanner } from "./ReconciliationBanner.js";
import { ReviewCategoryItem } from "./ReviewCategoryItem.js";
import { ReviewTransactionItem } from "./ReviewTransactionItem.js";
import { tapTargetSx } from "./tapTarget.js";

export interface StatementReviewChecklistProps {
  review: StatementReviewDTO;
  onMark: (keys: string[], reviewed: boolean) => void;
}

const headerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: { xs: "column", md: "row" },
  justifyContent: "space-between",
  alignItems: { md: "flex-start" },
  gap: 1.5,
  mb: 1.5,
};

const progressSx: SxProps<Theme> = { width: { xs: "100%", md: 240 }, flexShrink: 0 };

const progressLabelSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  justifyContent: { md: "flex-end" },
  gap: 1,
};

const sectionTitleSx: SxProps<Theme> = { mt: 2, mb: 0.5 };

const actionsSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: { xs: "column", md: "row" },
  justifyContent: "flex-end",
  gap: 1,
  mt: 2,
};

const checkChipProps = ({ check, label, count, skipped }: ReviewCheckSummary): ChipProps => {
  if (skipped) return { variant: "outlined", label: `${label}: sin historial` };
  if (count === 0) return { variant: "outlined", color: "success", icon: <CheckIcon />, label: `${label}: 0` };
  return { color: REVIEW_CHECK_COLORS[check], label: `${label}: ${count}` };
};

export const StatementReviewChecklist = ({ review, onMark }: StatementReviewChecklistProps) => {
  const isMobile = useIsMobile();
  const { statement, findings, reviewedKeys, historyStatements } = review;
  const { transactions, categories } = useMemo(() => splitFindings(findings), [findings]);
  const progress = useMemo(() => reviewProgress(findings, reviewedKeys), [findings, reviewedKeys]);
  const summary = useMemo(() => reviewCheckSummary(review), [review]);
  const reviewedSet = useMemo(() => new Set(reviewedKeys), [reviewedKeys]);
  const toggle = useCallback((key: string, reviewed: boolean) => onMark([key], reviewed), [onMark]);
  const markAll = useCallback(() => onMark(progress.pendingKeys, true), [onMark, progress.pendingKeys]);

  const hasFindings = progress.total > 0;
  const showDone = hasFindings && progress.done;
  const canMarkAll = progress.pending > 0;
  const hasUncategorized = transactions.some((finding) => finding.reasons.includes("sin-categoria"));
  const showActions = hasUncategorized || canMarkAll;
  const percent = hasFindings ? (progress.reviewed / progress.total) * 100 : 100;
  const progressLabel = `${progress.reviewed} de ${progress.total} revisados`;
  const checkChips = summary.map((item) => <Chip key={item.check} size="small" {...checkChipProps(item)} />);
  const transactionItems = transactions.map((finding) => (
    <ReviewTransactionItem
      key={finding.key}
      finding={finding}
      reviewed={reviewedSet.has(finding.key)}
      historyStatements={historyStatements}
      onToggle={toggle}
    />
  ));
  const categoryItems = categories.map((finding) => (
    <ReviewCategoryItem
      key={finding.key}
      finding={finding}
      reviewed={reviewedSet.has(finding.key)}
      historyStatements={historyStatements}
      onToggle={toggle}
    />
  ));

  return (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible">
      <Card>
        <CardContent sx={compactCardContentSx}>
          <Box sx={headerSx}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{statement.cardLabel}</Typography>
              <Typography variant="caption" color="text.secondary">{statementCaption(statement)}</Typography>
            </Box>
            {hasFindings && (
              <Box sx={progressSx}>
                <Box sx={progressLabelSx}>
                  <Typography variant="body2">{progressLabel}</Typography>
                  {showDone && <Chip size="small" color="success" label="Revisado" />}
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={percent}
                  aria-label="progreso de la revisión"
                  sx={{ mt: 0.5 }}
                />
              </Box>
            )}
          </Box>
          <ReconciliationBanner reconciliation={statement.reconciliation} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {historyCaption(review)}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>{checkChips}</Box>
          {!hasFindings && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
              <CheckCircleOutlineIcon color="success" />
              <Typography>No encontramos nada raro en este resumen.</Typography>
            </Box>
          )}
          {transactionItems.length > 0 && (
            <>
              <Typography variant="subtitle2" component="h3" sx={sectionTitleSx}>Movimientos</Typography>
              <List disablePadding>{transactionItems}</List>
            </>
          )}
          {categoryItems.length > 0 && (
            <>
              <Typography variant="subtitle2" component="h3" sx={sectionTitleSx}>
                Categorías por encima de su promedio
              </Typography>
              <List disablePadding>{categoryItems}</List>
            </>
          )}
          {showActions && (
            <Box sx={actionsSx}>
              {hasUncategorized && (
                <Button component={RouterLink} to="/rules" fullWidth={isMobile} sx={tapTargetSx}>
                  Categorizar en Reglas
                </Button>
              )}
              {canMarkAll && (
                <Button variant="outlined" onClick={markAll} fullWidth={isMobile} sx={tapTargetSx}>
                  Marcar todo como revisado
                </Button>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </MotionBox>
  );
};
