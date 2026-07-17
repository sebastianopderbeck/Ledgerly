import { Table, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { useCreditCoupons } from "../api/hooks.js";
import { formatMoney, formatUva } from "../format.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

export const MortgageCouponsTable = () => {
  const { data } = useCreditCoupons();
  if (!data || data.length === 0) return null;

  const rows = [...data].sort((a, b) => a.cuotaNro - b.cuotaNro);

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Cuota</TableCell>
            <TableCell>Fecha</TableCell>
            <TableCell align="right">Capital</TableCell>
            <TableCell align="right">Interés</TableCell>
            <TableCell align="right">Seguro</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell align="right">Cuota (UVA)</TableCell>
            <TableCell align="right">Cotización</TableCell>
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows.map((c) => (
            <MotionTableRow key={c.id} variants={fadeUpItem}>
              <TableCell>{c.cuotaNro}</TableCell>
              <TableCell>{c.fechaDebito}</TableCell>
              <TableCell align="right">{formatMoney(c.capital, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.intereses, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.seguroIncendio, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.totalDebitado, "ARS")}</TableCell>
              <TableCell align="right">{formatUva(c.cuotaPuraUva)}</TableCell>
              <TableCell align="right">{formatMoney(c.cotizacionUva, "ARS")}</TableCell>
            </MotionTableRow>
          ))}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
