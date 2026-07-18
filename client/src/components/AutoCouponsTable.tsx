import { useRef, useState } from "react";
import { Box, IconButton, Table, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import type { AutoCouponDTO } from "@ledgerly/shared";
import { useAutoCoupons, usePatchAutoRate } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

const RateCell = ({ coupon }: { coupon: AutoCouponDTO }) => {
  const patch = usePatchAutoRate();
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

export const AutoCouponsTable = () => {
  const { data } = useAutoCoupons();
  if (!data || data.length === 0) return null;

  const rows = [...data].sort((a, b) => a.cuotaNro - b.cuotaNro);
  const conceptLabels: string[] = [];
  for (const coupon of rows) {
    for (const concept of coupon.conceptos) {
      if (!conceptLabels.includes(concept.label)) conceptLabels.push(concept.label);
    }
  }
  const amountOf = (coupon: AutoCouponDTO, label: string): number | null =>
    coupon.conceptos.find((c) => c.label === label)?.amount ?? null;

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Cuota</TableCell>
            <TableCell>Vencimiento</TableCell>
            {conceptLabels.map((label) => (
              <TableCell key={label} align="right">{label}</TableCell>
            ))}
            <TableCell align="right">Total</TableCell>
            <TableCell align="right">Valor auto</TableCell>
            <TableCell align="right">TC oficial</TableCell>
            <TableCell align="right">Pagado (USD)</TableCell>
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows.map((c) => (
            <MotionTableRow key={c.id} variants={fadeUpItem}>
              <TableCell>{c.cuotaNro}</TableCell>
              <TableCell>{c.fechaVencimiento}</TableCell>
              {conceptLabels.map((label) => {
                const amount = amountOf(c, label);
                return (
                  <TableCell key={label} align="right">
                    {amount != null ? formatMoney(amount, "ARS") : <Typography component="span" color="text.disabled">—</Typography>}
                  </TableCell>
                );
              })}
              <TableCell align="right">{formatMoney(c.totalAPagar, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.valorMovil, "ARS")}</TableCell>
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
