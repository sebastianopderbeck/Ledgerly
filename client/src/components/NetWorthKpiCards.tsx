import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import SavingsIcon from "@mui/icons-material/Savings";
import { Typography } from "@mui/material";
import type { NetWorthDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { Kpi, type KpiColor } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";

interface NetWorthKpiCardsProps {
  data: NetWorthDTO;
}

const captionSx = { display: "block", mt: -1.5, mb: 3 } as const;

const formatArs = (value: number): string => formatMoney(value, "ARS");

const approxUsd = (value: number): string => `≈ ${formatMoney(value, "USD")}`;

export const NetWorthKpiCards = ({ data }: NetWorthKpiCardsProps) => {
  const { totales, usdOficial, usdOficialFecha, uva, uvaFecha } = data;
  const netColor: KpiColor = totales.netoArs < 0 ? "error" : "primary";
  const uvaText = uva !== null && uvaFecha !== null ? ` · UVA ${formatArs(uva)} al ${uvaFecha}` : "";

  return (
    <>
      <KpiGrid cardCount={3}>
        <Kpi label="Patrimonio neto" value={totales.netoArs} format={formatArs} sub={approxUsd(totales.netoUsd)} icon={<AccountBalanceWalletIcon />} color={netColor} />
        <Kpi label="Activos" value={totales.activosArs} format={formatArs} sub={approxUsd(totales.activosUsd)} icon={<SavingsIcon />} color="success" />
        <Kpi label="Pasivos" value={totales.pasivosArs} format={formatArs} sub={approxUsd(totales.pasivosUsd)} icon={<CreditCardIcon />} color="warning" />
      </KpiGrid>
      <Typography variant="caption" color="text.secondary" sx={captionSx}>
        Valuado con dólar oficial {formatArs(usdOficial)} al {usdOficialFecha}{uvaText}
      </Typography>
    </>
  );
};
