import { useState } from "react";
import { Alert, Button, CircularProgress, Stack, Table, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useApplyRules, useCategoryRules, useCreateRule, useDeleteRule, useUpdateRule } from "../api/hooks.js";
import { CategoryRuleForm } from "../components/CategoryRuleForm.js";
import { CategoryRuleRow } from "../components/CategoryRuleRow.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { RulesMobile } from "../components/RulesMobile.js";
import { MotionTableBody } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { useIsMobile } from "../useIsMobile.js";

const headerSx: SxProps<Theme> = {
  justifyContent: "space-between",
  alignItems: { xs: "stretch", md: "center" },
  gap: { xs: 2, md: 0 },
  mb: 3,
};

const APPLY_CONFIRM_MESSAGE =
  "Se recategorizan todos los movimientos que coinciden con alguna regla y se pueden pisar categorías que cambiaste a mano.";

export const RulesPage = () => {
  const isMobile = useIsMobile();
  const { data, isLoading, isError, error } = useCategoryRules();
  const create = useCreateRule();
  const update = useUpdateRule();
  const del = useDeleteRule();
  const apply = useApplyRules();
  const [confirmingApply, setConfirmingApply] = useState(false);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  const rules = data ?? [];
  const runApply = () => apply.mutate();
  const askApply = () => setConfirmingApply(true);
  const cancelApply = () => setConfirmingApply(false);
  const confirmApply = () => {
    setConfirmingApply(false);
    runApply();
  };
  const requestApply = isMobile ? askApply : runApply;
  const applyConfirmation = isMobile && (
    <ConfirmDialog
      open={confirmingApply}
      title="Reaplicar reglas"
      message={APPLY_CONFIRM_MESSAGE}
      confirmLabel="Reaplicar"
      onConfirm={confirmApply}
      onClose={cancelApply}
    />
  );
  const rulesView = isMobile ? (
    <RulesMobile
      rules={rules}
      onCreate={(values) => create.mutate(values)}
      onUpdate={(id, body) => update.mutate({ id, body })}
      onDelete={(id) => del.mutate(id)}
    />
  ) : (
    <>
      <CategoryRuleForm onCreate={(values) => create.mutate(values)} />

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Prioridad</TableCell><TableCell>Tipo</TableCell><TableCell>Patrón</TableCell>
            <TableCell>Categoría</TableCell><TableCell>Activa</TableCell><TableCell />
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rules.map((r) => (
            <CategoryRuleRow
              key={r.id}
              rule={r}
              onSave={(id, body) => update.mutate({ id, body })}
              onDelete={(id) => del.mutate(id)}
              onToggle={(id, enabled) => update.mutate({ id, body: { enabled } })}
            />
          ))}
        </MotionTableBody>
      </Table>
    </>
  );

  return (
    <>
      <Stack direction={{ xs: "column", md: "row" }} sx={headerSx}>
        <Typography variant="h4">Reglas de categoría</Typography>
        <Button variant="outlined" onClick={requestApply} disabled={apply.isPending}>
          Reaplicar a todo
        </Button>
      </Stack>

      {apply.isSuccess && <Alert severity="success" sx={{ mb: 2 }}>{apply.data.updated} movimientos recategorizados (las reglas pisan también las categorías manuales cuando matchean)</Alert>}

      {rulesView}
      {applyConfirmation}
    </>
  );
};
