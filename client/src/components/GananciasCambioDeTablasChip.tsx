import { Chip, Tooltip } from "@mui/material";

const DETALLE = "El empleador suele aplicar las tablas nuevas de ARCA un mes tarde y corregir al mes siguiente.";

export const GananciasCambioDeTablasChip = () => (
  <Tooltip title={DETALLE} describeChild>
    <Chip label="Cambio de tablas" size="small" />
  </Tooltip>
);
