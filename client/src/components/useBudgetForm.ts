import { useState } from "react";
import type { BudgetDTO, BudgetInput } from "@ledgerly/shared";
import { formatMoneyInput, parseMoneyInput } from "../moneyInput.js";

export interface BudgetEditorTarget {
  budget: BudgetDTO | null;
  category: string | null;
}

export interface BudgetForm {
  category: string;
  topeText: string;
  ajustaInflacion: boolean;
  topeArs: number | null;
  fixedCategory: boolean;
  draft: BudgetInput | null;
  setCategory: (category: string) => void;
  setTopeText: (text: string) => void;
  setAjustaInflacion: (ajustaInflacion: boolean) => void;
}

const positiveAmount = (text: string): number | null => {
  const value = parseMoneyInput(text);
  return value !== null && value > 0 ? value : null;
};

export const useBudgetForm = (target: BudgetEditorTarget | null, initialTope: number | null): BudgetForm => {
  const fixed = target?.budget?.category ?? target?.category ?? null;
  const [category, setCategory] = useState(fixed ?? "");
  const [topeText, setTopeText] = useState(initialTope === null ? "" : formatMoneyInput(initialTope));
  const [ajustaInflacion, setAjustaInflacion] = useState(target?.budget?.ajustaInflacion ?? false);
  const topeArs = positiveAmount(topeText);
  const trimmed = category.trim();
  const draft = trimmed !== "" && topeArs !== null ? { category: trimmed, topeArs, ajustaInflacion } : null;

  return {
    category,
    topeText,
    ajustaInflacion,
    topeArs,
    fixedCategory: fixed !== null,
    draft,
    setCategory,
    setTopeText,
    setAjustaInflacion,
  };
};
