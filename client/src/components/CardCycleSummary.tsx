import { Box, Card, CardContent, Typography } from "@mui/material";
import { useStatements, useOficialRate } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { buildCardCycleSummary } from "../cardCycle.js";
import { CardCycleChart } from "./charts/CardCycleChart.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";

export const CardCycleSummary = () => {
  const { data } = useStatements();
  const summary = buildCardCycleSummary(data ?? []);
  const { data: fx } = useOficialRate();
  const rate = fx?.rate ?? null;
  if (!summary) return null;

  return (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible" sx={{ mb: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 0.5 }}>A pagar al cierre</Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{formatMoney(summary.totalArs, "ARS")}</Typography>
            {rate && (
              <Typography variant="h6" color="text.secondary">≈ {formatMoney(summary.totalArs / rate, "USD")}</Typography>
            )}
          </Box>
          <Box sx={{ mb: 1 }}>
            {rate && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                al oficial {formatMoney(rate, "ARS")}
              </Typography>
            )}
            {summary.totalUsd > 0 && (
              <Typography variant="caption" color="text.secondary">
                + {formatMoney(summary.totalUsd, "USD")} en dólares
              </Typography>
            )}
          </Box>
          <CardCycleChart cards={summary.cards} />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: `repeat(${summary.cards.length}, 1fr)` },
              gap: 2,
              mt: 1,
            }}
          >
            {summary.cards.map((card) => (
              <Box key={card.issuer}>
                <Typography variant="subtitle2" noWrap>
                  {card.cardLabel}{card.last4 ? ` ···· ${card.last4}` : ""}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {formatMoney(card.saldoActualArs, "ARS")}
                  {card.saldoActualUsd > 0 ? ` · ${formatMoney(card.saldoActualUsd, "USD")}` : ""}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  corte {card.closingDate ?? "—"} · vence {card.dueDate ?? "—"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  mín. {formatMoney(card.pagoMinimoArs, "ARS")}
                </Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </MotionBox>
  );
};
