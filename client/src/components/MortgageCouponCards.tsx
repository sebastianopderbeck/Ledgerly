import { useCallback } from "react";
import { Box } from "@mui/material";
import type { MortgageCouponDTO } from "@ledgerly/shared";
import { usePatchCouponRate } from "../api/hooks.js";
import { useCreditCouponsInYears } from "../filters/useInYears.js";
import { formatMoney, formatMoneyOrDash, formatUva } from "../format.js";
import { RateSheet, RateValue } from "./RateSheet.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { useSheetTarget } from "./useSheetTarget.js";

const byCuotaNro = (a: MortgageCouponDTO, b: MortgageCouponDTO): number => a.cuotaNro - b.cuotaNro;

const highlightsOf = (coupon: MortgageCouponDTO): RecordField[] => [
  { label: "Total", value: formatMoney(coupon.totalDebitado, "ARS") },
  { label: "Pagado USD", value: formatMoneyOrDash(coupon.totalUsd, "USD") },
];

const detailsOf = (coupon: MortgageCouponDTO, onEditRate: () => void): RecordField[] => [
  { label: "Capital", value: formatMoney(coupon.capital, "ARS") },
  { label: "Interés", value: formatMoney(coupon.intereses, "ARS") },
  { label: "Seguro", value: formatMoney(coupon.seguroIncendio, "ARS") },
  { label: "Cuota UVA", value: formatUva(coupon.cuotaPuraUva) },
  { label: "Cotización UVA", value: formatMoney(coupon.cotizacionUva, "ARS") },
  {
    label: "TC oficial",
    value: <RateValue rate={coupon.tipoCambioUsd} editLabel={`editar TC cuota ${coupon.cuotaNro}`} onEdit={onEditRate} />,
  },
];

export const MortgageCouponCards = () => {
  const { data } = useCreditCouponsInYears();
  const { mutate: patchRate } = usePatchCouponRate();
  const { target, open, show, close } = useSheetTarget<MortgageCouponDTO>();

  const saveRate = useCallback((rate: number) => {
    if (target) patchRate({ id: target.id, tipoCambioUsd: rate });
  }, [patchRate, target]);

  if (!data || data.length === 0) return null;

  const cards = [...data].sort(byCuotaNro).map((coupon) => (
    <RecordCard
      key={coupon.id}
      title={`Cuota ${coupon.cuotaNro}`}
      meta={coupon.fechaDebito}
      highlights={highlightsOf(coupon)}
      details={detailsOf(coupon, () => show(coupon))}
    />
  ));
  const sheetTitle = target ? `TC cuota ${target.cuotaNro}` : "TC oficial";

  return (
    <>
      <Box sx={recordListSx}>{cards}</Box>
      <RateSheet
        open={open}
        title={sheetTitle}
        formKey={target?.id ?? ""}
        current={target?.tipoCambioUsd ?? null}
        onSave={saveRate}
        onClose={close}
      />
    </>
  );
};
