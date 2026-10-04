import { useId } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Snackbar, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { INBOX_PREVIEW_SIZE, inboxSummary, missingUsdRate, pendingLabel, type InboxOrder } from "../uncategorizedInbox.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { InboxTable } from "./InboxTable.js";
import { snackbarAboveNavSx } from "./snackbarSx.js";
import { useInboxSection } from "./useInboxSection.js";

interface UncategorizedInboxProps {
  rules: CategoryRuleDTO[];
}

interface OrderOption {
  value: InboxOrder;
  label: string;
}

const ORDER_OPTIONS: OrderOption[] = [
  { value: "amount", label: "Monto" },
  { value: "count", label: "Frecuencia" },
];

const SNACKBAR_ANCHOR = { vertical: "bottom", horizontal: "center" } as const;

const headerSx: SxProps<Theme> = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 2 };

export const UncategorizedInbox = ({ rules }: UncategorizedInboxProps) => {
  const titleId = useId();
  const {
    inbox, isLoading, error, order, changeOrder, showAll, toggleShowAll, visibleGroups, allGroups, categories,
    creating, createRule, feedback, dismissFeedback,
  } = useInboxSection(rules);

  if (isLoading) return <CircularProgress size={24} sx={{ mb: 3 }} />;
  if (error) return <Alert severity="error" sx={{ mb: 3 }}>{error.message}</Alert>;
  if (!inbox) return null;

  const { pendingCount } = inbox;
  const isEmpty = allGroups.length === 0;
  const hasMore = allGroups.length > INBOX_PREVIEW_SIZE;
  const showAllLabel = showAll ? "Mostrar menos" : `Mostrar todos (${allGroups.length})`;
  const orderButtons = ORDER_OPTIONS.map((option) => (
    <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>
  ));
  const summary = !isEmpty && (
    <Typography variant="body2" color="text.secondary">{inboxSummary(pendingCount, allGroups.length)}</Typography>
  );
  const orderPicker = !isEmpty && (
    <ToggleButtonGroup exclusive size="small" value={order} onChange={changeOrder} aria-label="Ordenar por" sx={{ ml: "auto" }}>
      {orderButtons}
    </ToggleButtonGroup>
  );
  const usdWarning = missingUsdRate(inbox) && (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
      Sin cotización del dólar cargada: los montos en USD no cuentan para ordenar por monto.
    </Typography>
  );
  const content = isEmpty ? (
    <Typography color="text.secondary">No quedan movimientos sin categoría.</Typography>
  ) : (
    <>
      <InboxTable groups={visibleGroups} allGroups={allGroups} categories={categories} creating={creating} onCreate={createRule} />
      {hasMore && <Button size="small" onClick={toggleShowAll} sx={{ mt: 1 }}>{showAllLabel}</Button>}
      {usdWarning}
    </>
  );

  return (
    <>
      <Card component="section" aria-labelledby={titleId} sx={{ mb: 3 }}>
        <CardContent sx={compactCardContentSx}>
          <Box sx={headerSx}>
            <Typography id={titleId} variant="h6">Sin categoría</Typography>
            <Chip
              size="small"
              label={pendingCount}
              color={pendingCount > 0 ? "warning" : "success"}
              aria-label={pendingLabel(pendingCount)}
            />
            {summary}
            {orderPicker}
          </Box>
          {content}
        </CardContent>
      </Card>
      <Snackbar
        open={feedback !== null}
        autoHideDuration={6000}
        onClose={dismissFeedback}
        sx={snackbarAboveNavSx}
        anchorOrigin={SNACKBAR_ANCHOR}
      >
        {feedback ? <Alert severity={feedback.severity} onClose={dismissFeedback}>{feedback.message}</Alert> : undefined}
      </Snackbar>
    </>
  );
};
