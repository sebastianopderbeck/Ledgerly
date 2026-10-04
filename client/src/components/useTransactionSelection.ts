import { useCallback, useMemo, useState } from "react";
import type { TransactionDTO } from "@ledgerly/shared";

export interface TransactionSelection {
  selecting: boolean;
  selectedIds: string[];
  pendingIds: string[] | null;
  startSelecting: () => void;
  stopSelecting: () => void;
  toggle: (id: string) => void;
  askDelete: (ids: string[]) => void;
  askDeleteSelected: () => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

export function useTransactionSelection(
  visibleRows: TransactionDTO[],
  onDelete: (ids: string[]) => void,
): TransactionSelection {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);

  const visibleIds = useMemo(() => new Set(visibleRows.map((row) => row.id)), [visibleRows]);
  const selectedIds = useMemo(() => selected.filter((id) => visibleIds.has(id)), [selected, visibleIds]);

  const startSelecting = useCallback(() => setSelecting(true), []);
  const stopSelecting = useCallback(() => {
    setSelecting(false);
    setSelected([]);
  }, []);
  const toggle = useCallback((id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);
  const askDelete = useCallback((ids: string[]) => setPendingIds(ids), []);
  const askDeleteSelected = useCallback(() => setPendingIds(selectedIds), [selectedIds]);
  const cancelDelete = useCallback(() => setPendingIds(null), []);
  const confirmDelete = useCallback(() => {
    if (pendingIds) onDelete(pendingIds);
    setPendingIds(null);
    stopSelecting();
  }, [pendingIds, onDelete, stopSelecting]);

  return {
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
  };
}
