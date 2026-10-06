import { useState } from "react";
import type { StatementDTO } from "@ledgerly/shared";
import { useStatementReviews, useStatements } from "../api/hooks.js";
import { reviewOptions, reviewProgress, selectedReviewId, type ReviewOption } from "../statementReview.js";

export interface ReviewPickerOption {
  id: string;
  label: string;
  caption: string;
  pending: number | null;
}

export interface StatementReviewPickerState {
  isLoading: boolean;
  error: Error | null;
  options: ReviewPickerOption[];
  selectedId: string | null;
  select: (id: string) => void;
}

const optionCaption = ({ statement, isLatest }: ReviewOption): string =>
  isLatest ? `vence ${statement.dueDate ?? "—"}` : `recién importado · cierre ${statement.closingDate ?? "—"}`;

export function useStatementReviewPicker(focusStatement: StatementDTO | null): StatementReviewPickerState {
  const statements = useStatements();
  const [selected, setSelected] = useState<string | null>(focusStatement?.id ?? null);
  const choices = reviewOptions(statements.data, focusStatement);
  const reviews = useStatementReviews(choices.map(({ statement }) => statement.id));
  const options = choices.map((choice, position): ReviewPickerOption => {
    const review = reviews[position]?.data;
    return {
      id: choice.statement.id,
      label: choice.statement.cardLabel,
      caption: optionCaption(choice),
      pending: review ? reviewProgress(review.findings, review.reviewedKeys).pending : null,
    };
  });

  return {
    isLoading: statements.isLoading,
    error: statements.error,
    options,
    selectedId: selectedReviewId(options, selected),
    select: setSelected,
  };
}
