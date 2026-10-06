import { Box, Typography } from "@mui/material";
import type { RealSpendingSummary } from "../realSpending.js";
import { formatMoney, formatMonthLabel, formatSignedPercent } from "../format.js";
import { addMonths } from "../isoDate.js";

interface RealSpendingStatsProps {
  summary: RealSpendingSummary;
}

interface StatCell {
  label: string;
  value: number | null;
  caption: string;
}

const trendColor = (value: number | null): string => {
  if (value === null || value === 0) return "text.primary";
  return value > 0 ? "warning.main" : "success.main";
};

const monthInText = (month: string): string => formatMonthLabel(month).toLowerCase();

export const RealSpendingStats = ({ summary }: RealSpendingStatsProps) => {
  const { month, real, interanual, vsPromedio, mesesPromedio } = summary;
  const previousYear = monthInText(addMonths(month, -12));
  const headline = `${formatMonthLabel(month)}: ${formatMoney(real, "ARS")}`;
  const cells: StatCell[] = [
    {
      label: "Interanual",
      value: interanual,
      caption: interanual === null ? `sin datos de ${previousYear}` : `vs ${previousYear}`,
    },
    {
      label: "Vs promedio",
      value: vsPromedio,
      caption: vsPromedio === null ? "faltan meses anteriores" : `de los ${mesesPromedio} meses anteriores`,
    },
  ];
  const rendered = cells.map(({ label, value, caption }) => ({
    label,
    caption,
    text: value === null ? "—" : formatSignedPercent(value),
    color: trendColor(value),
  }));

  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="body2">{headline}</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mt: 1 }}>
        {rendered.map(({ label, caption, text, color }) => (
          <Box key={label} sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
              {label}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color }}>{text}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{caption}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
