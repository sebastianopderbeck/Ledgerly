import { useCallback, useState } from "react";
import type { BudgetDTO, BudgetInput } from "@ledgerly/shared";
import { useCreateBudget, useDeleteBudget, useUpdateBudget } from "./api/hooks.js";
import { useSheetTarget } from "./components/useSheetTarget.js";
import type { BudgetEditorTarget } from "./components/useBudgetForm.js";

type BudgetAction = "create" | "update" | "delete";

export interface BudgetEditorState {
  open: boolean;
  target: BudgetEditorTarget | null;
  editorKey: number;
  pendingDelete: BudgetDTO | null;
  error: Error | null;
  openNew: () => void;
  openForCategory: (category: string) => void;
  openEdit: (budget: BudgetDTO) => void;
  close: () => void;
  save: (draft: BudgetInput) => void;
  askDelete: (budget: BudgetDTO) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
}

export const useBudgetEditor = (): BudgetEditorState => {
  const { target, open, show, close } = useSheetTarget<BudgetEditorTarget>();
  const [editorKey, setEditorKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<BudgetDTO | null>(null);
  const [lastAction, setLastAction] = useState<BudgetAction | null>(null);
  const { mutate: createBudget, error: createError } = useCreateBudget();
  const { mutate: updateBudget, error: updateError } = useUpdateBudget();
  const { mutate: deleteBudget, error: deleteError } = useDeleteBudget();

  const showTarget = useCallback((next: BudgetEditorTarget) => {
    setEditorKey((key) => key + 1);
    show(next);
  }, [show]);

  const openNew = useCallback(() => showTarget({ budget: null, category: null }), [showTarget]);
  const openForCategory = useCallback((category: string) => showTarget({ budget: null, category }), [showTarget]);
  const openEdit = useCallback((budget: BudgetDTO) => showTarget({ budget, category: budget.category }), [showTarget]);

  const save = useCallback((draft: BudgetInput) => {
    const budget = target?.budget ?? null;
    if (budget) {
      setLastAction("update");
      updateBudget({ id: budget.id, body: { topeArs: draft.topeArs, ajustaInflacion: draft.ajustaInflacion } });
      return;
    }
    setLastAction("create");
    createBudget(draft);
  }, [target, updateBudget, createBudget]);

  const askDelete = useCallback((budget: BudgetDTO) => {
    close();
    setPendingDelete(budget);
  }, [close]);

  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const confirmDelete = useCallback(() => {
    if (pendingDelete) {
      setLastAction("delete");
      deleteBudget(pendingDelete.id);
    }
    setPendingDelete(null);
  }, [pendingDelete, deleteBudget]);

  const errors: Record<BudgetAction, Error | null> = { create: createError, update: updateError, delete: deleteError };

  return {
    open,
    target,
    editorKey,
    pendingDelete,
    error: lastAction === null ? null : errors[lastAction],
    openNew,
    openForCategory,
    openEdit,
    close,
    save,
    askDelete,
    confirmDelete,
    cancelDelete,
  };
};
