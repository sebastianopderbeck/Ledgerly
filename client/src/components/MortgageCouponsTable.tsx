import { useRef, useState } from "react";
import { Box, IconButton, Table, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import type { MortgageCouponDTO } from "@ledgerly/shared";
import { useCreditCoupons, usePatchCouponRate } from "../api/hooks.js";
import { formatMoney, formatUva } from "../format.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

const RateCell = ({ coupon }: { coupon: MortgageCouponDTO }) => {
  const patch = usePatchCouponRate();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(coupon.tipoCambioUsd ?? ""));
  const savingRef = useRef(false);

  const save = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setEditing(false);
    const parsed = Number(value);
    if (parsed > 0 && parsed !== coupon.tipoCambioUsd) patch.mutate({ id: coupon.id, tipoCambioUsd: parsed });
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
        inputProps={{ "aria-label": `TC cuota ${coupon.cuotaNro}`, style: { textAlign: "right", width: 90 } }}
      />
    );
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
      {coupon.tipoCambioUsd != null ? formatMoney(coupon.tipoCambioUsd, "ARS") : "—"}
      <IconButton size="small" aria-label={`editar TC cuota ${coupon.cuotaNro}`} onClick={() => { savingRef.current = false; setValue(String(coupon.tipoCambioUsd ?? "")); setEditing(true); }}>
        <EditIcon fontSize="inherit" />
      </IconButton>
    </Box>
  );
};

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
            <TableCell align="right">TC oficial</TableCell>
            <TableCell align="right">Pagado (USD)</TableCell>
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
              <TableCell align="right"><RateCell coupon={c} /></TableCell>
              <TableCell align="right">
                {c.totalUsd != null ? formatMoney(c.totalUsd, "USD") : <Typography component="span" color="text.disabled">—</Typography>}
              </TableCell>
            </MotionTableRow>
          ))}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
