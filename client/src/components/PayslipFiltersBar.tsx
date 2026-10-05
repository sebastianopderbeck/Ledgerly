import { Box, MenuItem, TextField } from "@mui/material";
import { formatMonthLabel } from "../format.js";
import type { PeriodoOrden } from "../payslipConcepts.js";
import { isPayslipTipoFilter, PAYSLIP_TIPO_OPTIONS, type PayslipFilters } from "../salaryFilters.js";
import { useIsMobile } from "../useIsMobile.js";
import { PeriodoSortButton } from "./PeriodoSortButton.js";

interface PayslipFiltersBarProps {
  filters: PayslipFilters;
  periodos: string[];
  orden: PeriodoOrden;
  onChange: (patch: Partial<PayslipFilters>) => void;
  onToggleOrden: () => void;
}

interface PeriodoSelectProps {
  label: string;
  value: string;
  periodos: string[];
  onChange: (periodo: string) => void;
}

const withSelected = (periodos: string[], value: string): string[] =>
  value && !periodos.includes(value) ? [value, ...periodos] : periodos;

const PeriodoSelect = ({ label, value, periodos, onChange }: PeriodoSelectProps) => {
  const options = withSelected(periodos, value).map((periodo) => (
    <MenuItem key={periodo} value={periodo}>{formatMonthLabel(periodo)}</MenuItem>
  ));
  return (
    <TextField
      select label={label} size="small" sx={{ minWidth: 180 }}
      value={value} onChange={(event) => onChange(event.target.value)}
    >
      <MenuItem value="">Todos</MenuItem>
      {options}
    </TextField>
  );
};

export const PayslipFiltersBar = ({ filters, periodos, orden, onChange, onToggleOrden }: PayslipFiltersBarProps) => {
  const isMobile = useIsMobile();
  const tipoOptions = PAYSLIP_TIPO_OPTIONS.map(({ value, label }) => (
    <MenuItem key={value} value={value}>{label}</MenuItem>
  ));

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
      <TextField
        select label="Tipo" size="small" sx={{ minWidth: 140 }}
        value={filters.tipo}
        onChange={(event) => { if (isPayslipTipoFilter(event.target.value)) onChange({ tipo: event.target.value }); }}
      >
        {tipoOptions}
      </TextField>
      <PeriodoSelect label="Desde" value={filters.desde} periodos={periodos} onChange={(desde) => onChange({ desde })} />
      <PeriodoSelect label="Hasta" value={filters.hasta} periodos={periodos} onChange={(hasta) => onChange({ hasta })} />
      {isMobile && <PeriodoSortButton orden={orden} onToggle={onToggleOrden} />}
    </Box>
  );
};
