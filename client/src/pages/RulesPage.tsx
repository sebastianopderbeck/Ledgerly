import { Alert, Button, CircularProgress, Stack, Table, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useApplyRules, useCategoryRules, useCreateRule, useDeleteRule, useUpdateRule } from "../api/hooks.js";
import { CategoryRuleForm } from "../components/CategoryRuleForm.js";
import { CategoryRuleRow } from "../components/CategoryRuleRow.js";
import { MotionTableBody } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";

export const RulesPage = () => {
  const { data, isLoading, isError, error } = useCategoryRules();
  const create = useCreateRule();
  const update = useUpdateRule();
  const del = useDeleteRule();
  const apply = useApplyRules();

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">Reglas de categoría</Typography>
        <Button variant="outlined" onClick={() => apply.mutate()} disabled={apply.isPending}>
          Reaplicar a todo
        </Button>
      </Stack>

      {apply.isSuccess && <Alert severity="success" sx={{ mb: 2 }}>{apply.data.updated} movimientos recategorizados (las reglas pisan también las categorías manuales cuando matchean)</Alert>}

      <CategoryRuleForm onCreate={(values) => create.mutate(values)} />

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Prioridad</TableCell><TableCell>Tipo</TableCell><TableCell>Patrón</TableCell>
            <TableCell>Categoría</TableCell><TableCell>Activa</TableCell><TableCell />
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {(data ?? []).map((r) => (
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
};
