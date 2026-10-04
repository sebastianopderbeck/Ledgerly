import { Box, Chip, Typography } from "@mui/material";
import type { ReviewTransactionFinding } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { REVIEW_CHECK_COLORS, REVIEW_REASON_LABELS, transactionFindingNotes } from "../statementReview.js";
import { ReviewFindingRow, findingDetailsSx } from "./ReviewFindingRow.js";

export interface ReviewTransactionItemProps {
  finding: ReviewTransactionFinding;
  reviewed: boolean;
  historyStatements: number;
  onToggle: (key: string, reviewed: boolean) => void;
}

export const ReviewTransactionItem = ({ finding, reviewed, historyStatements, onToggle }: ReviewTransactionItemProps) => {
  const { transaction, reasons } = finding;
  const showCategory = !reasons.includes("sin-categoria");
  const reasonChips = reasons.map((reason) => (
    <Chip key={reason} size="small" color={REVIEW_CHECK_COLORS[reason]} label={REVIEW_REASON_LABELS[reason]} />
  ));
  const notes = transactionFindingNotes(finding, historyStatements).map((note) => (
    <Typography key={note} variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
      {note}
    </Typography>
  ));

  return (
    <ReviewFindingRow
      findingKey={finding.key}
      title={transaction.merchant}
      amount={formatMoney(transaction.amount, transaction.currency)}
      reviewed={reviewed}
      onToggle={onToggle}
    >
      <Box sx={findingDetailsSx}>
        <Typography variant="caption" color="text.secondary">{transaction.date}</Typography>
        {showCategory && <Chip size="small" variant="outlined" label={transaction.category} />}
        {reasonChips}
      </Box>
      {notes}
    </ReviewFindingRow>
  );
};
