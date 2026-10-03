import { useCallback } from "react";
import { Box } from "@mui/material";
import type { AutoCouponDTO } from "@ledgerly/shared";
import { usePatchAutoRate } from "../api/hooks.js";
import { byCuotaNro, uniqueConceptLabels } from "../autoConcepts.js";
import { useAutoCouponsInYears } from "../filters/useInYears.js";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import { RateSheet, RateValue } from "./RateSheet.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { useSheetTarget } from "./useSheetTarget.js";

const amountOf = (coupon: AutoCouponDTO, label: string): number | null =>
  coupon.conceptos.find((concept) => concept.label === label)?.amount ?? null;

const highlightsOf = (coupon: AutoCouponDTO): RecordField[] => [
  { label: "Total", value: formatMoney(coupon.totalAPagar, "ARS") },
  { label: "Pagado USD", value: formatMoneyOrDash(coupon.totalUsd, "USD") },
];

const detailsOf = (coupon: AutoCouponDTO, conceptLabels: string[], onEditRate: () => void): RecordField[] => [
  ...conceptLabels.map((label) => ({ label, value: formatMoneyOrDash(amountOf(coupon, label), "ARS") })),
  { label: "Valor auto", value: formatMoney(coupon.valorMovil, "ARS") },
  {
    label: "TC oficial",
    value: <RateValue rate={coupon.tipoCambioUsd} editLabel={`editar TC cuota ${coupon.cuotaNro}`} onEdit={onEditRate} />,
  },
];

export const AutoCouponCards = () => {
  const { data } = useAutoCouponsInYears();
  const { mutate: patchRate } = usePatchAutoRate();
  const { target, open, show, close } = useSheetTarget<AutoCouponDTO>();

  const saveRate = useCallback((rate: number) => {
    if (target) patchRate({ id: target.id, tipoCambioUsd: rate });
  }, [patchRate, target]);

  if (!data || data.length === 0) return null;

  const coupons = [...data].sort(byCuotaNro);
  const conceptLabels = uniqueConceptLabels(coupons);
  const cards = coupons.map((coupon) => (
    <RecordCard
      key={coupon.id}
      title={`Cuota ${coupon.cuotaNro}`}
      meta={`vence ${coupon.fechaVencimiento}`}
      highlights={highlightsOf(coupon)}
      details={detailsOf(coupon, conceptLabels, () => show(coupon))}
    />
  ));
  const sheetTitle = target ? `TC cuota ${target.cuotaNro}` : "TC oficial";

  return (
    <>
      <Box sx={recordListSx}>{cards}</Box>
      <RateSheet open={open} title={sheetTitle} current={target?.tipoCambioUsd ?? null} onSave={saveRate} onClose={close} />
    </>
  );
};
