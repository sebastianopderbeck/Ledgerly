import { useState, type ChangeEvent, type MouseEvent } from "react";
import { Box, Button, Collapse, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { MacroAssumptions } from "../macroSignals.js";

const REVERSION_OPTIONS = [
  { value: "12", label: "Revierte en 12 meses" },
  { value: "24", label: "Revierte en 24 meses" },
  { value: "none", label: "Sin reversión" },
];

interface MacroAssumptionsBarProps {
  assumptions: MacroAssumptions;
  onChange: (assumptions: MacroAssumptions) => void;
}

export const MacroAssumptionsBar = ({ assumptions, onChange }: MacroAssumptionsBarProps) => {
  const [open, setOpen] = useState(false);

  const handleNumber = (field: "inflacionEsperada" | "tasaAnualPesos") => (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value);
    if (Number.isFinite(parsed)) onChange({ ...assumptions, [field]: parsed });
  };

  const handleReversion = (_event: MouseEvent<HTMLElement>, value: string | null) => {
    if (value === null) return;
    onChange({ ...assumptions, reversionMeses: value === "none" ? null : (Number(value) as 12 | 24) });
  };

  const reversionValue = assumptions.reversionMeses === null ? "none" : String(assumptions.reversionMeses);

  return (
    <Box sx={{ mb: 3 }}>
      <Button size="small" onClick={() => setOpen(!open)}>
        {open ? "Ocultar supuestos" : "Ver supuestos"}
      </Button>
      <Collapse in={open}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", mt: 1 }}>
          <TextField
            size="small"
            type="number"
            label="Inflación esperada (% anual)"
            value={assumptions.inflacionEsperada}
            onChange={handleNumber("inflacionEsperada")}
          />
          <TextField
            size="small"
            type="number"
            label="Tasa en pesos (TNA %)"
            value={assumptions.tasaAnualPesos}
            onChange={handleNumber("tasaAnualPesos")}
          />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={reversionValue}
            onChange={handleReversion}
            aria-label="Horizonte de reversión del dólar"
          >
            {REVERSION_OPTIONS.map((option) => (
              <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Los supuestos no se guardan: al recargar vuelven a los valores derivados de los datos.
        </Typography>
      </Collapse>
    </Box>
  );
};
