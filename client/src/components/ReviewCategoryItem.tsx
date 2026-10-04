import { Box, Chip, Typography } from "@mui/material";
import type { ReviewCategoryFinding } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { categoryFindingBadge, categoryFindingNote } from "../statementReview.js";
import { ReviewFindingRow, findingDetailsSx } from "./ReviewFindingRow.js";

export interface ReviewCategoryItemProps {
  finding: ReviewCategoryFinding;
  reviewed: boolean;
  historyStatements: number;
  onToggle: (key: string, reviewed: boolean) => void;
}

export const ReviewCategoryItem = ({ finding, reviewed, historyStatements, onToggle }: ReviewCategoryItemProps) => (
  <ReviewFindingRow
    findingKey={finding.key}
    title={finding.category}
    amount={formatMoney(finding.total, "ARS")}
    reviewed={reviewed}
    onToggle={onToggle}
  >
    <Box sx={findingDetailsSx}>
      <Typography variant="caption" color="text.secondary">{categoryFindingNote(finding, historyStatements)}</Typography>
      <Chip size="small" color="warning" label={categoryFindingBadge(finding)} />
    </Box>
  </ReviewFindingRow>
);
