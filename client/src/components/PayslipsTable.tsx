import { useRef, useState } from "react";
import { Box, Chip, IconButton, Table, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import type { PayslipDTO } from "@ledgerly/shared";
import { usePatchPayslipRate } from "../api/hooks.js";
import { byPeriodo, uniqueConceptLabels } from "../payslipConcepts.js";
import { formatMoney, formatPercent, formatPercentOrDash } from "../format.js";
import { ipcWindowLabel, raiseFor, type SalaryRaise } from "../salaryRaises.js";
import { SalaryRaiseChip } from "./SalaryRaiseChip.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

const dash = <Typography component="span" color="text.disabled">—</Typography>;

const RateCell = ({ payslip }: { payslip: PayslipDTO }) => {
  const patch = usePatchPayslipRate();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(payslip.tipoCambioUsd ?? ""));
  const savingRef = useRef(false);

  const save = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setEditing(false);
    const parsed = Number(value);
    if (parsed > 0 && parsed !== payslip.tipoCambioUsd) patch.mutate({ id: payslip.id, tipoCambioUsd: parsed });
  };

  if (editing) {
    return (
      <TextField
        size="small"
        type="number"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        inputProps={{ "aria-label": `TC recibo ${payslip.periodo}`, style: { textAlign: "right", width: 90 } }}
      />
    );
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
      {payslip.tipoCambioUsd != null ? formatMoney(payslip.tipoCambioUsd, "ARS") : "—"}
      <IconButton size="small" aria-label={`editar TC recibo ${payslip.periodo}`} onClick={() => { savingRef.current = false; setValue(String(payslip.tipoCambioUsd ?? "")); setEditing(true); }}>
        <EditIcon fontSize="inherit" />
      </IconButton>
    </Box>
  );
};

interface RaiseCellsProps {
  raise: SalaryRaise | undefined;
}

const RaiseCells = ({ raise }: RaiseCellsProps) => {
  if (!raise) {
    return (
      <>
        <TableCell align="right">{dash}</TableCell>
        <TableCell align="right">{dash}</TableCell>
        <TableCell align="right">{dash}</TableCell>
        <TableCell align="right">{dash}</TableCell>
      </>
    );
  }
  return (
    <>
      <TableCell align="right">{formatPercent(raise.basicoPct)}</TableCell>
      <TableCell align="right">{formatPercentOrDash(raise.brutoPct)}</TableCell>
      <TableCell align="right">
        <Tooltip title={`IPC de ${ipcWindowLabel(raise)}`} describeChild>
          <span>{formatPercentOrDash(raise.ipcPct)}</span>
        </Tooltip>
      </TableCell>
      <TableCell align="right"><SalaryRaiseChip raise={raise} /></TableCell>
    </>
  );
};

interface PayslipsTableProps {
  payslips: PayslipDTO[];
  raises: Map<string, SalaryRaise>;
}

export const PayslipsTable = ({ payslips, raises }: PayslipsTableProps) => {
  if (payslips.length === 0) return null;

  const rows = [...payslips].sort(byPeriodo);
  const conceptLabels = uniqueConceptLabels(rows);
  const montoOf = (payslip: PayslipDTO, label: string): number | null =>
    payslip.conceptos.find((c) => c.label === label)?.monto ?? null;

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Período</TableCell>
            <TableCell align="right">Bruto</TableCell>
            <TableCell align="right">Aumento básico</TableCell>
            <TableCell align="right">Aumento bruto</TableCell>
            <TableCell align="right">IPC acumulado</TableCell>
            <TableCell align="right">vs IPC</TableCell>
            <TableCell align="right">Neto</TableCell>
            <TableCell align="right">Neto (USD)</TableCell>
              {conceptLabels.map((label) => (
                  <TableCell key={label} align="right">{label}</TableCell>
              ))}
            <TableCell align="right">Descuentos</TableCell>
            <TableCell align="right">TC oficial</TableCell>
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows.map((p) => (
            <MotionTableRow key={p.id} variants={fadeUpItem}>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {p.periodo}
                {p.tipo === "sac" && <Chip label="SAC" size="small" color="secondary" variant="outlined" sx={{ ml: 1 }} />}
              </TableCell>
              <TableCell align="right">{formatMoney(p.brutoTotal, "ARS")}</TableCell>
              <RaiseCells raise={raiseFor(raises, p)} />
              <TableCell align="right">{formatMoney(p.neto, "ARS")}</TableCell>
              <TableCell align="right">{p.netoUsd != null ? formatMoney(p.netoUsd, "USD") : dash}</TableCell>
                {conceptLabels.map((label) => {
                    const monto = montoOf(p, label);
                    return (
                        <TableCell key={label} align="right">
                            {monto != null ? formatMoney(monto, "ARS") : dash}
                        </TableCell>
                    );
                })}

                <TableCell align="right">{formatMoney(p.descuentos, "ARS")}</TableCell>
              <TableCell align="right"><RateCell payslip={p} /></TableCell>
            </MotionTableRow>
          ))}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
