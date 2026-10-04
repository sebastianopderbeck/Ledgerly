import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, Chip, IconButton, LinearProgress, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import type { BudgetDTO } from "@ledgerly/shared";
import {
  BUDGET_STATUS_COLOR, BUDGET_STATUS_LABEL, budgetBalanceText, budgetInflationNote, formatPesos, monthInText, type BudgetLine,
} from "../budgets.js";
import { formatPercent } from "../format.js";
import { transactionsLink } from "../filters/transactionsLink.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { iconTapTargetSx, tapTargetSx } from "./tapTarget.js";

interface BudgetProgressListProps {
  lines: BudgetLine[];
  month: string;
  latestIpc: string | null;
  hasSpending: boolean;
  onEdit: (budget: BudgetDTO) => void;
}

interface BudgetProgressRowProps {
  line: BudgetLine;
  month: string;
  latestIpc: string | null;
  onEdit: (budget: BudgetDTO) => void;
}

const CRITERIA =
  "Mismo criterio que el Dashboard: consumos en pesos por fecha de compra, todas las tarjetas. Las compras en cuotas suman cada cuota a medida que llegan los resúmenes.";

const listSx: SxProps<Theme> = { listStyle: "none", m: 0, p: 0, display: "grid", gap: 2.5 };
const titleRowSx: SxProps<Theme> = { display: "flex", alignItems: "center", gap: 1 };
const progressSx: SxProps<Theme> = { height: 8, borderRadius: 4, my: 0.5, "& .MuiLinearProgress-bar": { borderRadius: 4 } };
const amountsRowSx: SxProps<Theme> = { display: "flex", justifyContent: "space-between", gap: 1, mt: 0.5 };
const footerRowSx: SxProps<Theme> = {
  display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", columnGap: 1,
};

const BudgetProgressRow = ({ line, month, latestIpc, onEdit }: BudgetProgressRowProps) => {
  const { budget, category, tope, gastado, restante, ratio, estado } = line;
  const color = BUDGET_STATUS_COLOR[estado];
  const edit = () => onEdit(budget);
  const amounts = `${formatPesos(gastado)} de ${formatPesos(tope)}`;
  const caption = `${budgetBalanceText(restante)}${budgetInflationNote(budget, month, latestIpc)}`;
  const link = transactionsLink({ category, month, currency: "ARS" });

  return (
    <Box component="li" aria-label={category}>
      <Box sx={titleRowSx}>
        <Typography variant="subtitle1" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{category}</Typography>
        <Chip size="small" color={color} label={BUDGET_STATUS_LABEL[estado]} />
        <IconButton aria-label={`editar tope de ${category}`} onClick={edit} sx={iconTapTargetSx}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(ratio, 1) * 100}
        color={color}
        aria-label={`avance de ${category}`}
        sx={progressSx}
      />
      <Box sx={amountsRowSx}>
        <Typography variant="body2">{amounts}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatPercent(ratio * 100)}</Typography>
      </Box>
      <Box sx={footerRowSx}>
        <Typography variant="caption" color="text.secondary">{caption}</Typography>
        <Button size="small" component={RouterLink} to={link} sx={tapTargetSx}>Ver movimientos</Button>
      </Box>
    </Box>
  );
};

export const BudgetProgressList = ({ lines, month, latestIpc, hasSpending, onEdit }: BudgetProgressListProps) => {
  const rows = lines.map((line) => (
    <BudgetProgressRow key={line.budget.id} line={line} month={month} latestIpc={latestIpc} onEdit={onEdit} />
  ));
  const noSpending = !hasSpending && (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{`Sin consumos en ${monthInText(month)}.`}</Typography>
  );

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={compactCardContentSx}>
        <Typography variant="h6">Por categoría</Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>{CRITERIA}</Typography>
        {noSpending}
        <Box component="ul" aria-label="topes por categoría" sx={listSx}>{rows}</Box>
      </CardContent>
    </Card>
  );
};
