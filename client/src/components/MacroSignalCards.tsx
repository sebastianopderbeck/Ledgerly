import type { ReactNode } from "react";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import SavingsIcon from "@mui/icons-material/Savings";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import type { MacroOption, MacroSignal, SignalStatus } from "../macroSignals.js";
import { formatPercent } from "../format.js";
import { Kpi, type KpiColor } from "./Kpi.js";
import { MotionBox } from "./motion/motion.js";
import { staggerContainer } from "./motion/variants.js";

const STATUS_COLOR: Record<SignalStatus, KpiColor> = { good: "success", neutral: "warning", bad: "error" };

const SIGNAL_ICON: Record<MacroOption, ReactNode> = {
  dolar: <TrendingUpIcon />,
  pesos: <SavingsIcon />,
  adelantar: <AccountBalanceIcon />,
};

const FORMATTERS: Record<MacroSignal["format"], (value: number) => string> = {
  indice: (value) => value.toFixed(0),
  porcentaje: (value) => formatPercent(value),
};

interface MacroSignalCardsProps {
  signals: MacroSignal[];
}

export const MacroSignalCards = ({ signals }: MacroSignalCardsProps) => {
  if (signals.length === 0) return null;

  return (
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: `repeat(${signals.length}, 1fr)` }, gap: 2, mb: 3 }}
    >
      {signals.map((signal) => (
        <Kpi
          key={signal.id}
          label={signal.label}
          value={signal.value}
          format={FORMATTERS[signal.format]}
          sub={signal.reading}
          subMultiline
          icon={SIGNAL_ICON[signal.id]}
          color={STATUS_COLOR[signal.status]}
        />
      ))}
    </MotionBox>
  );
};
