import type { ChangeEvent } from "react";
import { Box, Button, FormControlLabel, FormHelperText, MenuItem, Switch, TextField } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { BudgetDTO, BudgetInput } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { monthInText } from "../budgets.js";
import { ResponsiveSheet } from "./ResponsiveSheet.js";
import { MIN_TAP_SIZE } from "./tapTarget.js";
import { useBudgetForm, type BudgetEditorTarget } from "./useBudgetForm.js";

interface BudgetEditorProps {
  open: boolean;
  target: BudgetEditorTarget | null;
  editorKey: number;
  categoryOptions: string[];
  initialTope: number | null;
  latestIpc: string | null;
  onClose: () => void;
  onSave: (draft: BudgetInput) => void;
  onDelete: (budget: BudgetDTO) => void;
}

type BudgetEditorSheetProps = Omit<BudgetEditorProps, "editorKey">;

const actionSx: SxProps<Theme> = { minHeight: MIN_TAP_SIZE, flex: { xs: 1, md: "0 0 auto" } };

const deleteSx: SxProps<Theme> = { minHeight: MIN_TAP_SIZE, flex: { xs: 1, md: "0 0 auto" }, mr: { md: "auto" } };

const amountInputProps = { inputMode: "decimal" } as const;

const NO_OPTIONS = "Todas las categorías ya tienen tope.";

const amountHelper = (topeArs: number | null): string =>
  topeArs === null ? "Ingresá un monto mayor a cero" : `= ${formatMoney(topeArs, "ARS")} por mes`;

const inflationHelper = (latestIpc: string | null): string =>
  latestIpc === null
    ? "Todavía no hay IPC cargado: el tope queda fijo hasta que actualices los datos desde la barra superior."
    : `Queda en pesos de ${monthInText(latestIpc)}: sube cada mes con el IPC publicado y, para el histórico, se deflacta hacia atrás.`;

const editorTitle = (target: BudgetEditorTarget | null): string =>
  target?.budget ? `Tope de ${target.budget.category}` : "Nuevo tope";

const BudgetEditorSheet = ({
  open, target, categoryOptions, initialTope, latestIpc, onClose, onSave, onDelete,
}: BudgetEditorSheetProps) => {
  const form = useBudgetForm(target, initialTope);
  const budget = target?.budget ?? null;
  const amountError = form.topeText.trim() !== "" && form.topeArs === null;
  const categoryHelper = categoryOptions.length === 0 ? NO_OPTIONS : undefined;

  const changeCategory = (event: ChangeEvent<HTMLInputElement>) => form.setCategory(event.target.value);
  const changeTope = (event: ChangeEvent<HTMLInputElement>) => form.setTopeText(event.target.value);
  const changeAjusta = (event: ChangeEvent<HTMLInputElement>) => form.setAjustaInflacion(event.target.checked);
  const save = () => {
    if (!form.draft) return;
    onSave(form.draft);
    onClose();
  };

  const categoryItems = categoryOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>);
  const categoryField = form.fixedCategory ? (
    <TextField label="Categoría" value={form.category} disabled fullWidth />
  ) : (
    <TextField select label="Categoría" value={form.category} onChange={changeCategory} helperText={categoryHelper} fullWidth>
      {categoryItems}
    </TextField>
  );
  const deleteButton = budget && (
    <Button color="error" onClick={() => onDelete(budget)} sx={deleteSx}>Borrar</Button>
  );
  const actions = (
    <>
      {deleteButton}
      <Button onClick={onClose} sx={actionSx}>Cancelar</Button>
      <Button variant="contained" disabled={form.draft === null} onClick={save} sx={actionSx}>Guardar</Button>
    </>
  );

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={editorTitle(target)} actions={actions}>
      <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
        {categoryField}
        <TextField
          label="Tope mensual (ARS)"
          value={form.topeText}
          onChange={changeTope}
          error={amountError}
          helperText={amountHelper(form.topeArs)}
          fullWidth
          slotProps={{ htmlInput: amountInputProps }}
        />
        <Box>
          <FormControlLabel
            control={<Switch checked={form.ajustaInflacion} onChange={changeAjusta} />}
            label="Ajustar por inflación"
          />
          <FormHelperText>{inflationHelper(latestIpc)}</FormHelperText>
        </Box>
      </Box>
    </ResponsiveSheet>
  );
};

export const BudgetEditor = ({
  open, target, editorKey, categoryOptions, initialTope, latestIpc, onClose, onSave, onDelete,
}: BudgetEditorProps) => (
  <BudgetEditorSheet
    key={editorKey}
    open={open}
    target={target}
    categoryOptions={categoryOptions}
    initialTope={initialTope}
    latestIpc={latestIpc}
    onClose={onClose}
    onSave={onSave}
    onDelete={onDelete}
  />
);
