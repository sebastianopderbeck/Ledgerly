import { Alert, Button, CircularProgress, IconButton, Stack, Switch, Table, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useApplyRules, useCategoryRules, useCreateRule, useDeleteRule, useUpdateRule } from "../api/hooks.js";
import { CategoryRuleForm } from "../components/CategoryRuleForm.js";
import { MotionTableBody, MotionTableRow } from "../components/motion/motion.js";
import { fadeItem, staggerContainer } from "../components/motion/variants.js";

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

      {apply.isSuccess && <Alert severity="success" sx={{ mb: 2 }}>{apply.data.updated} movimientos recategorizados</Alert>}

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
            <MotionTableRow key={r.id} variants={fadeItem}>
              <TableCell>{r.priority}</TableCell>
              <TableCell>{r.matchType}</TableCell>
              <TableCell>{r.pattern}</TableCell>
              <TableCell>{r.category}</TableCell>
              <TableCell>
                <Switch checked={r.enabled} onChange={(e) => update.mutate({ id: r.id, body: { enabled: e.target.checked } })} />
              </TableCell>
              <TableCell>
                <IconButton aria-label="borrar" onClick={() => del.mutate(r.id)}><DeleteIcon /></IconButton>
              </TableCell>
            </MotionTableRow>
          ))}
        </MotionTableBody>
      </Table>
    </>
  );
};
