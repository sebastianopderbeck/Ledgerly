import type { ChangeEvent, MouseEvent } from "react";
import {
  Alert, Box, Button, IconButton, List, ListItem, ListItemText, MenuItem, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { Currency, ManualAssetDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import {
  ASSET_NAME_MAX_LENGTH, ASSET_TYPE_LABELS, ASSET_TYPES, isAssetType, isCurrency, valuationsNewestFirst,
  type AssetRequest,
} from "../netWorth.js";
import { ResponsiveSheet } from "./ResponsiveSheet.js";
import { iconTapTargetSx, tapTargetSx } from "./tapTarget.js";
import { useManualAssetForm } from "./useManualAssetForm.js";

interface ManualAssetEditorProps {
  open: boolean;
  asset: ManualAssetDTO | null;
  today: string;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (request: AssetRequest) => void;
  onDelete: () => void;
  onDeleteValuation: (fecha: string) => void;
}

type ManualAssetFormProps = Omit<ManualAssetEditorProps, "open" | "onClose">;

interface ValuationHistoryProps {
  asset: ManualAssetDTO;
  onDeleteValuation: (fecha: string) => void;
}

const VALUE_LABELS: Record<Currency, string> = { ARS: "Valor en pesos", USD: "Valor en dólares" };

const DATE_HELPER = "Si cambiás el valor se guarda una valuación con esta fecha; con la fecha de una existente, la corrige.";

const typeOptions = ASSET_TYPES.map((tipo) => <MenuItem key={tipo} value={tipo}>{ASSET_TYPE_LABELS[tipo]}</MenuItem>);

const ValuationHistory = ({ asset, onDeleteValuation }: ValuationHistoryProps) => {
  const rows = valuationsNewestFirst(asset).map(({ fecha, monto }) => (
    <ListItem
      key={fecha}
      disableGutters
      secondaryAction={(
        <IconButton
          edge="end"
          aria-label={`borrar valuación del ${fecha}`}
          onClick={() => onDeleteValuation(fecha)}
          sx={iconTapTargetSx}
        >
          <DeleteOutlineIcon />
        </IconButton>
      )}
    >
      <ListItemText primary={`${fecha} · ${formatMoney(monto, asset.moneda)}`} />
    </ListItem>
  ));

  return (
    <Box>
      <Typography variant="subtitle2">Valuaciones</Typography>
      <List dense disablePadding aria-label="valuaciones">{rows}</List>
    </Box>
  );
};

const ManualAssetForm = ({ asset, today, error, saving, onSave, onDelete, onDeleteValuation }: ManualAssetFormProps) => {
  const { draft, setNombre, setTipo, setMoneda, setMonto, setFecha, request } = useManualAssetForm(asset, today);
  const editing = asset !== null;

  const changeNombre = (event: ChangeEvent<HTMLInputElement>) => setNombre(event.target.value);
  const changeTipo = (event: ChangeEvent<HTMLInputElement>) => {
    if (isAssetType(event.target.value)) setTipo(event.target.value);
  };
  const changeMoneda = (_event: MouseEvent<HTMLElement>, value: unknown) => {
    if (isCurrency(value)) setMoneda(value);
  };
  const changeMonto = (event: ChangeEvent<HTMLInputElement>) => setMonto(event.target.value);
  const changeFecha = (event: ChangeEvent<HTMLInputElement>) => setFecha(event.target.value);
  const save = () => {
    if (request) onSave(request);
  };

  const currencyHint = editing && (
    <Typography variant="caption" color="text.secondary">La moneda no se puede cambiar</Typography>
  );
  const errorAlert = error && <Alert severity="error">{error}</Alert>;
  const deleteButton = editing && (
    <Button fullWidth color="error" onClick={onDelete} sx={tapTargetSx}>Borrar</Button>
  );
  const history = asset && asset.valuaciones.length > 1 && (
    <ValuationHistory asset={asset} onDeleteValuation={onDeleteValuation} />
  );

  return (
    <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
      <TextField
        label="Nombre"
        value={draft.nombre}
        onChange={changeNombre}
        fullWidth
        slotProps={{ htmlInput: { maxLength: ASSET_NAME_MAX_LENGTH } }}
      />
      <TextField select label="Tipo" value={draft.tipo} onChange={changeTipo} fullWidth>
        {typeOptions}
      </TextField>
      <Box>
        <ToggleButtonGroup
          exclusive
          fullWidth
          aria-label="moneda"
          value={draft.moneda}
          onChange={changeMoneda}
          disabled={editing}
        >
          <ToggleButton value="ARS" sx={tapTargetSx}>Pesos</ToggleButton>
          <ToggleButton value="USD" sx={tapTargetSx}>Dólares</ToggleButton>
        </ToggleButtonGroup>
        {currencyHint}
      </Box>
      <TextField
        label={VALUE_LABELS[draft.moneda]}
        value={draft.monto}
        onChange={changeMonto}
        fullWidth
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
      />
      <TextField
        type="date"
        label="Fecha de valuación"
        value={draft.fecha}
        onChange={changeFecha}
        fullWidth
        helperText={DATE_HELPER}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
      />
      {errorAlert}
      <Box sx={{ display: "flex", gap: 1 }}>
        {deleteButton}
        <Button fullWidth variant="contained" disabled={!request || saving} onClick={save} sx={tapTargetSx}>
          Guardar
        </Button>
      </Box>
      {history}
    </Box>
  );
};

export const ManualAssetEditor = ({
  open, asset, today, error, saving, onClose, onSave, onDelete, onDeleteValuation,
}: ManualAssetEditorProps) => {
  const title = asset ? "Editar activo" : "Nuevo activo";

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={title}>
      <ManualAssetForm
        key={asset?.id ?? "nuevo"}
        asset={asset}
        today={today}
        error={error}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
        onDeleteValuation={onDeleteValuation}
      />
    </ResponsiveSheet>
  );
};
