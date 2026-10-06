import { useId } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Snackbar, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { INBOX_PREVIEW_SIZE, inboxSummary, missingUsdRate, pendingLabel, type InboxOrder } from "../uncategorizedInbox.js";
import { useIsMobile } from "../useIsMobile.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { InboxList } from "./InboxList.js";
import { InboxTable } from "./InboxTable.js";
import { snackbarAboveNavSx } from "./snackbarSx.js";
import { MIN_TAP_SIZE, tapTargetSx } from "./tapTarget.js";
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
const orderDesktopSx: SxProps<Theme> = { ml: "auto" };
const showAllSx: SxProps<Theme> = { mt: 1 };
const showAllMobileSx: SxProps<Theme> = { mt: 1, minHeight: MIN_TAP_SIZE };

export const UncategorizedInbox = ({ rules }: UncategorizedInboxProps) => {
  const isMobile = useIsMobile();
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
  const InboxView = isMobile ? InboxList : InboxTable;
  const orderButtons = ORDER_OPTIONS.map((option) => (
    <ToggleButton key={option.value} value={option.value} sx={isMobile ? tapTargetSx : undefined}>{option.label}</ToggleButton>
  ));
  const summary = !isEmpty && (
    <Typography variant="body2" color="text.secondary">{inboxSummary(pendingCount, allGroups.length)}</Typography>
  );
  const orderPicker = !isEmpty && (
    <ToggleButtonGroup
      exclusive
      size="small"
      fullWidth={isMobile}
      value={order}
      onChange={changeOrder}
      aria-label="Ordenar por"
      sx={isMobile ? undefined : orderDesktopSx}
    >
      {orderButtons}
    </ToggleButtonGroup>
  );
  const showAllButton = hasMore && (
    <Button size="small" fullWidth={isMobile} onClick={toggleShowAll} sx={isMobile ? showAllMobileSx : showAllSx}>
      {showAllLabel}
    </Button>
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
      <InboxView groups={visibleGroups} allGroups={allGroups} categories={categories} creating={creating} onCreate={createRule} />
      {showAllButton}
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
