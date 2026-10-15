import type { ChangeEvent, MouseEvent } from "react";
import { Alert, Box, Button, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { FixedServiceCadencia, FixedServiceDTO } from "@ledgerly/shared";
import {
  CADENCIA_SERVICIO_LABEL, FIXED_SERVICE_CADENCIAS, SERVICE_NAME_MAX_LENGTH, isFixedServiceCadencia,
  type FixedServiceRequest,
} from "../fixedServices.js";
import { ResponsiveSheet } from "./ResponsiveSheet.js";
import { tapTargetSx } from "./tapTarget.js";
import { useFixedServiceForm } from "./useFixedServiceForm.js";

interface FixedServiceEditorProps {
  open: boolean;
  service: FixedServiceDTO | null;
  mesActual: string;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (request: FixedServiceRequest) => void;
  onDelete: () => void;
}

type FixedServiceFormProps = Omit<FixedServiceEditorProps, "open" | "onClose">;

const DESDE_HELPER: Record<FixedServiceCadencia, string> = {
  mensual: "El primer mes que se resta en el Flujo",
  bimestral: "El primer mes en que lo pagás",
};
const HASTA_HELPER = "Dejá vacío mientras lo sigas pagando";
const DELETE_HELPER = "Lo saca también de los meses pasados. Para dejar de pagarlo, completá Hasta.";
const MONTH_SLOT_PROPS = { inputLabel: { shrink: true } };

const cadenceButtons = FIXED_SERVICE_CADENCIAS.map((cadencia) => (
  <ToggleButton key={cadencia} value={cadencia} sx={tapTargetSx}>{CADENCIA_SERVICIO_LABEL[cadencia]}</ToggleButton>
));

const FixedServiceForm = ({ service, mesActual, error, saving, onSave, onDelete }: FixedServiceFormProps) => {
  const { draft, setNombre, setMonto, setCadencia, setDesde, setHasta, request } = useFixedServiceForm(service, mesActual);
  const editing = service !== null;

  const changeNombre = (event: ChangeEvent<HTMLInputElement>) => setNombre(event.target.value);
  const changeMonto = (event: ChangeEvent<HTMLInputElement>) => setMonto(event.target.value);
  const changeCadencia = (_event: MouseEvent<HTMLElement>, value: unknown) => {
    if (isFixedServiceCadencia(value)) setCadencia(value);
  };
  const changeDesde = (event: ChangeEvent<HTMLInputElement>) => setDesde(event.target.value);
  const changeHasta = (event: ChangeEvent<HTMLInputElement>) => setHasta(event.target.value);
  const save = () => {
    if (request) onSave(request);
  };

  const hastaField = editing && (
    <TextField
      type="month"
      label="Hasta"
      value={draft.hasta}
      onChange={changeHasta}
      fullWidth
      helperText={HASTA_HELPER}
      slotProps={MONTH_SLOT_PROPS}
    />
  );
  const errorAlert = error && <Alert severity="error">{error}</Alert>;
  const deleteButton = editing && <Button fullWidth color="error" onClick={onDelete} sx={tapTargetSx}>Borrar</Button>;
  const deleteHint = editing && <Typography variant="caption" color="text.secondary">{DELETE_HELPER}</Typography>;

  return (
    <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
      <TextField
        label="Nombre"
        value={draft.nombre}
        onChange={changeNombre}
        fullWidth
        slotProps={{ htmlInput: { maxLength: SERVICE_NAME_MAX_LENGTH } }}
      />
      <TextField
        label="Monto en pesos"
        value={draft.monto}
        onChange={changeMonto}
        fullWidth
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
      />
      <ToggleButtonGroup exclusive fullWidth aria-label="cadencia" value={draft.cadencia} onChange={changeCadencia}>
        {cadenceButtons}
      </ToggleButtonGroup>
      <TextField
        type="month"
        label="Desde"
        value={draft.desde}
        onChange={changeDesde}
        fullWidth
        helperText={DESDE_HELPER[draft.cadencia]}
        slotProps={MONTH_SLOT_PROPS}
      />
      {hastaField}
      {errorAlert}
      <Box sx={{ display: "flex", gap: 1 }}>
        {deleteButton}
        <Button fullWidth variant="contained" disabled={!request || saving} onClick={save} sx={tapTargetSx}>
          Guardar
        </Button>
      </Box>
      {deleteHint}
    </Box>
  );
};

export const FixedServiceEditor = ({ open, service, mesActual, error, saving, onClose, onSave, onDelete }: FixedServiceEditorProps) => {
  const title = service ? "Editar servicio" : "Nuevo servicio";

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={title}>
      <FixedServiceForm
        key={service?.id ?? "nuevo"}
        service={service}
        mesActual={mesActual}
        error={error}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
      />
    </ResponsiveSheet>
  );
};
