import { TableCell, TableSortLabel } from "@mui/material";
import type { PeriodoOrden } from "../payslipConcepts.js";

interface PeriodoSortHeaderProps {
  orden: PeriodoOrden;
  onToggle: () => void;
}

export const PeriodoSortHeader = ({ orden, onToggle }: PeriodoSortHeaderProps) => (
  <TableCell sortDirection={orden}>
    <TableSortLabel active direction={orden} onClick={onToggle}>Período</TableSortLabel>
  </TableCell>
);
