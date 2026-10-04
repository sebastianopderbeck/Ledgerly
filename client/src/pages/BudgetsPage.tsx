import { Alert, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import type { BudgetDTO } from "@ledgerly/shared";
import { currentLimit } from "../budgets.js";
import { useBudgetsPage } from "../useBudgetsPage.js";
import { useBudgetEditor } from "../useBudgetEditor.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { BudgetMonthPicker } from "../components/BudgetMonthPicker.js";
import { BudgetKpiCards } from "../components/BudgetKpiCards.js";
import { BudgetProgressList } from "../components/BudgetProgressList.js";
import { UnbudgetedCategories } from "../components/UnbudgetedCategories.js";
import { BudgetEditor } from "../components/BudgetEditor.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { BudgetComplianceChart } from "../components/charts/BudgetComplianceChart.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { tapTargetSx } from "../components/tapTarget.js";

const BUDGET_FIELDS: FilterField[] = ["year"];

const WELCOME = "Todavía no definiste topes. Creá uno con «Nuevo tope» o desde las categorías de abajo.";

const headerSx: SxProps<Theme> = {
  justifyContent: "space-between",
  alignItems: { xs: "stretch", md: "center" },
  gap: { xs: 2, md: 0 },
  mb: 3,
};

const Title = () => <Typography variant="h4" sx={{ mb: 3 }}>Presupuestos</Typography>;

const deleteMessage = (budget: BudgetDTO | null): string =>
  budget ? `¿Borrar el tope de «${budget.category}»? El histórico deja de contarla.` : "";

export const BudgetsPage = () => {
  const page = useBudgetsPage();
  const editor = useBudgetEditor();

  if (page.isLoading) {
    return (
      <>
        <Title />
        <CircularProgress />
      </>
    );
  }

  if (page.error) {
    return (
      <>
        <Title />
        <Alert severity="error">{page.error.message}</Alert>
      </>
    );
  }

  const hasBudgets = page.budgets.length > 0;
  const initialTope = editor.target?.budget ? currentLimit(editor.target.budget, page.inflation) : null;
  const editorError = editor.error && <Alert severity="error" sx={{ mb: 2 }}>{editor.error.message}</Alert>;
  const welcome = !hasBudgets && <Typography color="text.secondary" sx={{ mb: 3 }}>{WELCOME}</Typography>;
  const kpis = page.totals && <BudgetKpiCards totals={page.totals} />;
  const progress = hasBudgets && (
    <BudgetProgressList
      lines={page.lines}
      month={page.month}
      latestIpc={page.latestIpc}
      hasSpending={page.hasSpending}
      onEdit={editor.openEdit}
    />
  );
  const unbudgeted = page.unbudgeted.length > 0 && (
    <UnbudgetedCategories month={page.month} categories={page.unbudgeted} onAdd={editor.openForCategory} />
  );
  const compliance = hasBudgets && (
    <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={{ mb: 3 }}>
      <ChartCard title="Cumplimiento mes a mes (topes actuales)">
        <BudgetComplianceChart history={page.history} />
      </ChartCard>
    </MotionBox>
  );

  return (
    <>
      <Stack direction={{ xs: "column", md: "row" }} sx={headerSx}>
        <Typography variant="h4">Presupuestos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={editor.openNew} sx={tapTargetSx}>Nuevo tope</Button>
      </Stack>
      {editorError}
      <FiltersBar fields={BUDGET_FIELDS} yearOptions={page.yearOptions} />
      <BudgetMonthPicker month={page.month} months={page.months} partial={page.partial} onChange={page.selectMonth} />
      {welcome}
      {kpis}
      {progress}
      {unbudgeted}
      {compliance}
      <BudgetEditor
        open={editor.open}
        target={editor.target}
        editorKey={editor.editorKey}
        categoryOptions={page.categoryOptions}
        initialTope={initialTope}
        latestIpc={page.latestIpc}
        onClose={editor.close}
        onSave={editor.save}
        onDelete={editor.askDelete}
      />
      <ConfirmDialog
        open={editor.pendingDelete !== null}
        title="Borrar tope"
        message={deleteMessage(editor.pendingDelete)}
        confirmLabel="Borrar"
        onConfirm={editor.confirmDelete}
        onClose={editor.cancelDelete}
      />
    </>
  );
};
