import { Card, CardContent, Typography } from "@mui/material";
import type { PayslipDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { sumDescuento } from "../payslipConcepts.js";
import { MotionBox } from "./motion/motion.js";
import { CountUp } from "./motion/CountUp.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

interface DescuentoKpiSpec {
  label: string;
  match: (normalizedLabel: string) => boolean;
}

const SPECS: DescuentoKpiSpec[] = [
  { label: "Jubilación", match: (label) => label === "JUBILACION" },
  { label: "Obra social", match: (label) => label === "OBRA SOCIAL" },
  { label: "Retención 4º categoría", match: (label) => label.includes("RETENCION") && label.includes("4") },
];

interface PayslipDescuentoKpisProps {
  payslips: PayslipDTO[];
}

export const PayslipDescuentoKpis = ({ payslips }: PayslipDescuentoKpisProps) => {
  const totals = SPECS.map((spec) => ({ label: spec.label, ...sumDescuento(payslips, spec.match) }));

  return (
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2, mb: 3 }}
    >
      {totals.map((total) => (
        <MotionBox key={total.label} variants={fadeUpItem}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
                {total.label}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }} noWrap>
                <CountUp value={total.ars} format={(value) => formatMoney(value, "ARS")} />
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                <CountUp value={total.usd} format={(value) => formatMoney(value, "USD")} />
              </Typography>
            </CardContent>
          </Card>
        </MotionBox>
      ))}
    </MotionBox>
  );
};
