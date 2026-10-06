import { Chip, Table, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { formatMoneyOrDash, formatMonthLabel } from "../format.js";
import { formatSavingsRate, isNegative } from "../cashFlow.js";
import { CashFlowStatusChip } from "./CashFlowStatusChip.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

interface CashFlowTableProps {
  meses: CashFlowMonthDTO[];
}

interface CashFlowTableRowProps {
  mes: CashFlowMonthDTO;
}

const AMOUNT_HEADERS = ["Ingreso", "Tarjetas", "Hipoteca", "Auto", "Egresos", "Margen", "Ahorro"];
const NO_WRAP = { whiteSpace: "nowrap" } as const;

const money = (value: number | null): string => formatMoneyOrDash(value, "ARS");

const CashFlowTableRow = ({ mes }: CashFlowTableRowProps) => {
  const margenColor = isNegative(mes.margen) ? "error.main" : undefined;
  const sacChip = mes.conSac ? <Chip label="SAC" size="small" color="secondary" variant="outlined" sx={{ ml: 1 }} /> : null;

  return (
    <MotionTableRow variants={fadeUpItem}>
      <TableCell sx={NO_WRAP}>{formatMonthLabel(mes.mes)}</TableCell>
      <TableCell><CashFlowStatusChip estado={mes.estado} /></TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.ingreso)}{sacChip}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.tarjetas)}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.hipoteca)}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.auto)}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(mes.egresos)}</TableCell>
      <TableCell align="right" sx={{ ...NO_WRAP, color: margenColor }}>{money(mes.margen)}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{formatSavingsRate(mes.tasaAhorro)}</TableCell>
    </MotionTableRow>
  );
};

export const CashFlowTable = ({ meses }: CashFlowTableProps) => {
  if (meses.length === 0) return null;

  const amountHeaders = AMOUNT_HEADERS.map((header) => <TableCell key={header} align="right">{header}</TableCell>);
  const rows = meses.map((mes) => <CashFlowTableRow key={mes.mes} mes={mes} />);

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label="Detalle del flujo de caja">
        <TableHead>
          <TableRow>
            <TableCell>Mes</TableCell>
            <TableCell>Estado</TableCell>
            {amountHeaders}
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
