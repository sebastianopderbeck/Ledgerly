import { Chip, type ChipProps } from "@mui/material";
import type { CashFlowEstado } from "@ledgerly/shared";
import { ESTADO_LABEL } from "../cashFlow.js";

interface CashFlowStatusChipProps {
  estado: CashFlowEstado;
}

const ESTADO_COLOR: Record<CashFlowEstado, ChipProps["color"]> = {
  completo: "success",
  incompleto: "warning",
  en_curso: "info",
  proyectado: "default",
};

export const CashFlowStatusChip = ({ estado }: CashFlowStatusChipProps) => (
  <Chip label={ESTADO_LABEL[estado]} size="small" variant="outlined" color={ESTADO_COLOR[estado]} />
);
