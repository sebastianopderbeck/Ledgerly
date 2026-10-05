import { Button } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import type { PeriodoOrden } from "../payslipConcepts.js";
import { tapTargetSx } from "./tapTarget.js";

interface PeriodoSortButtonProps {
  orden: PeriodoOrden;
  onToggle: () => void;
}

export const PeriodoSortButton = ({ orden, onToggle }: PeriodoSortButtonProps) => {
  const isDesc = orden === "desc";
  const icon = isDesc ? <ArrowDownwardIcon /> : <ArrowUpwardIcon />;
  const label = isDesc ? "Más nuevos primero" : "Más viejos primero";

  return (
    <Button variant="outlined" startIcon={icon} onClick={onToggle} sx={tapTargetSx}>
      {label}
    </Button>
  );
};
