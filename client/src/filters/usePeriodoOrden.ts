import { useCallback, useState } from "react";
import type { PeriodoOrden } from "../payslipConcepts.js";

export interface PeriodoOrdenState {
  orden: PeriodoOrden;
  toggleOrden: () => void;
}

export const usePeriodoOrden = (): PeriodoOrdenState => {
  const [orden, setOrden] = useState<PeriodoOrden>("desc");
  const toggleOrden = useCallback(() => setOrden((current) => (current === "desc" ? "asc" : "desc")), []);
  return { orden, toggleOrden };
};
