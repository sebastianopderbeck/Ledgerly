import { useCallback, useMemo, useState } from "react";
import { Box, Button, Checkbox, Chip, List, ListItem, ListItemButton, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { TransactionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { installmentLabel } from "../transactionInstallment.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { MOBILE_NAV_HEIGHT } from "./layout/MobileBottomNav.js";
import { TransactionSheet } from "./TransactionSheet.js";
import { MIN_TAP_SIZE, tapTargetSx } from "./tapTarget.js";
import { useSheetTarget } from "./useSheetTarget.js";
import { useTransactionSelection } from "./useTransactionSelection.js";

interface TransactionsListProps {
  rows: TransactionDTO[];
  onCategoryChange: (id: string, category: string) => void;
  onDelete: (ids: string[]) => void;
  onMarkSubscription: (transactionId: string) => void;
}

interface TransactionRowProps {
  row: TransactionDTO;
  selecting: boolean;
  selected: boolean;
  onOpen: (row: TransactionDTO) => void;
  onToggle: (id: string) => void;
}

export const TRANSACTIONS_PAGE_SIZE = 50;
const SELECTION_BAR_HEIGHT = 64;

const selectionBarSx: SxProps<Theme> = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
  height: SELECTION_BAR_HEIGHT,
  zIndex: (theme) => theme.zIndex.appBar,
  display: "flex",
  alignItems: "center",
  gap: 1,
  px: 2,
  bgcolor: "background.paper",
  borderTop: 1,
  borderColor: "divider",
};

const deleteMessage = (count: number): string =>
  count === 1
    ? "¿Borrar este movimiento? Esta acción no se puede deshacer."
    : `¿Borrar ${count} movimientos? Esta acción no se puede deshacer.`;

const TransactionRow = ({ row, selecting, selected, onOpen, onToggle }: TransactionRowProps) => {
  const installment = installmentLabel(row);
  const handleClick = () => (selecting ? onToggle(row.id) : onOpen(row));

  return (
    <ListItem disablePadding divider>
      <ListItemButton onClick={handleClick} sx={{ gap: 1.5, px: 1, py: 1.25 }}>
        {selecting && (
          <Checkbox
            edge="start"
            checked={selected}
            tabIndex={-1}
            disableRipple
            inputProps={{ "aria-label": `seleccionar ${row.merchant}` }}
            sx={{ p: 0.5 }}
          />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{row.merchant}</Typography>
            <Typography sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatMoney(row.amount, row.currency)}</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">{row.date}</Typography>
            <Chip size="small" label={row.category} />
            {installment && <Chip size="small" variant="outlined" label={installment} />}
          </Box>
        </Box>
      </ListItemButton>
    </ListItem>
  );
};

export const TransactionsList = ({ rows, onCategoryChange, onDelete, onMarkSubscription }: TransactionsListProps) => {
  const [visibleCount, setVisibleCount] = useState(TRANSACTIONS_PAGE_SIZE);
  const { target, open, show, close } = useSheetTarget<TransactionDTO>();
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const {
    selecting,
    selectedIds,
    pendingIds,
    startSelecting,
    stopSelecting,
    toggle,
    askDelete,
    askDeleteSelected,
    cancelDelete,
    confirmDelete,
  } = useTransactionSelection(visibleRows, onDelete);

  const showMore = useCallback(() => setVisibleCount((count) => count + TRANSACTIONS_PAGE_SIZE), []);
  const askDeleteOne = useCallback((transaction: TransactionDTO) => {
    close();
    askDelete([transaction.id]);
  }, [close, askDelete]);

  const hasMore = rows.length > visibleRows.length;
  const isEmpty = rows.length === 0;
  const canStartSelecting = !selecting && !isEmpty;
  const countLabel = rows.length === 1 ? "1 movimiento" : `${rows.length} movimientos`;
  const deleteLabel = `Borrar (${selectedIds.length})`;
  const sectionSx: SxProps<Theme> = { pb: selecting ? `${SELECTION_BAR_HEIGHT}px` : 0 };
  const items = visibleRows.map((row) => (
    <TransactionRow
      key={row.id}
      row={row}
      selecting={selecting}
      selected={selectedIds.includes(row.id)}
      onOpen={show}
      onToggle={toggle}
    />
  ));

  return (
    <Box component="section" aria-label="movimientos" sx={sectionSx}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: MIN_TAP_SIZE, mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">{countLabel}</Typography>
        {canStartSelecting && <Button size="small" onClick={startSelecting} sx={tapTargetSx}>Seleccionar</Button>}
      </Box>
      {isEmpty && <Typography color="text.secondary">No hay movimientos con estos filtros.</Typography>}
      <List disablePadding>{items}</List>
      {hasMore && <Button fullWidth onClick={showMore} sx={{ mt: 1 }}>Ver más</Button>}
      {selecting && (
        <Box role="toolbar" aria-label="selección" sx={selectionBarSx}>
          <Button fullWidth onClick={stopSelecting}>Cancelar</Button>
          <Button fullWidth variant="contained" color="error" disabled={selectedIds.length === 0} onClick={askDeleteSelected}>
            {deleteLabel}
          </Button>
        </Box>
      )}
      <TransactionSheet
        transaction={target}
        open={open}
        onClose={close}
        onSave={onCategoryChange}
        onDelete={askDeleteOne}
        onMarkSubscription={onMarkSubscription}
      />
      <ConfirmDialog
        open={pendingIds !== null}
        title="Borrar movimientos"
        message={deleteMessage(pendingIds?.length ?? 0)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
    </Box>
  );
};
