import { Chip } from "@mui/material";
import { veredictoRetencionColor, veredictoRetencionLabel, type VeredictoRetencion } from "../gananciasRetencion.js";

interface GananciasVeredictoChipProps {
  veredicto: VeredictoRetencion;
}

export const GananciasVeredictoChip = ({ veredicto }: GananciasVeredictoChipProps) => (
  <Chip
    label={veredictoRetencionLabel(veredicto)}
    color={veredictoRetencionColor(veredicto)}
    size="small"
    variant="outlined"
  />
);
