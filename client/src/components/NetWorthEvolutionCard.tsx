import { useState, type MouseEvent } from "react";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { Currency, NetWorthMonthDTO } from "@ledgerly/shared";
import { isCurrency } from "../netWorth.js";
import { useIsMobile } from "../useIsMobile.js";
import { ChartCard } from "./charts/ChartCard.js";
import { NetWorthChart } from "./charts/NetWorthChart.js";
import { tapTargetSx } from "./tapTarget.js";

interface NetWorthEvolutionCardProps {
  months: NetWorthMonthDTO[];
}

const HISTORY_HINT =
  "Los activos cargados a mano cuentan desde su primera valuación: si querés historia, cargalos con fecha pasada.";

export const NetWorthEvolutionCard = ({ months }: NetWorthEvolutionCardProps) => {
  const [currency, setCurrency] = useState<Currency>("USD");
  const isMobile = useIsMobile();
  const toggleSx = isMobile ? tapTargetSx : undefined;

  const changeCurrency = (_event: MouseEvent<HTMLElement>, value: unknown) => {
    if (isCurrency(value)) setCurrency(value);
  };

  return (
    <ChartCard title="Evolución del patrimonio">
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          aria-label="moneda del gráfico"
          value={currency}
          onChange={changeCurrency}
        >
          <ToggleButton value="USD" sx={toggleSx}>USD</ToggleButton>
          <ToggleButton value="ARS" sx={toggleSx}>Pesos</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <NetWorthChart months={months} currency={currency} />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {HISTORY_HINT}
      </Typography>
    </ChartCard>
  );
};
