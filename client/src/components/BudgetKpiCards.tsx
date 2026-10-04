import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import { BUDGET_STATUS_COLOR, formatPesos, type BudgetTotals } from "../budgets.js";
import { formatPercent } from "../format.js";
import { Kpi } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";

interface BudgetKpiCardsProps {
  totals: BudgetTotals;
}

export const BudgetKpiCards = ({ totals }: BudgetKpiCardsProps) => {
  const balanceLabel = totals.restante < 0 ? "Excedido" : "Disponible";
  const usedSub = `${formatPercent(totals.ratio * 100)} usado`;
  const nearSub = totals.cerca > 0 ? `${totals.cerca} cerca del tope` : undefined;
  const fulfilled = (value: number): string => `${Math.round(value)} de ${totals.total}`;

  return (
    <KpiGrid cardCount={3}>
      <Kpi
        label="Gastado con tope"
        value={totals.gastado}
        format={formatPesos}
        sub={`de ${formatPesos(totals.tope)}`}
        icon={<ShoppingCartOutlinedIcon />}
        color="primary"
      />
      <Kpi
        label={balanceLabel}
        value={Math.abs(totals.restante)}
        format={formatPesos}
        sub={usedSub}
        icon={<AccountBalanceWalletOutlinedIcon />}
        color={BUDGET_STATUS_COLOR[totals.estado]}
      />
      <Kpi
        label="Topes cumplidos"
        value={totals.cumplidos}
        format={fulfilled}
        sub={nearSub}
        icon={<TaskAltOutlinedIcon />}
        color="secondary"
      />
    </KpiGrid>
  );
};
