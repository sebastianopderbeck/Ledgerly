import { Box, Checkbox, FormControlLabel, ListItemText, MenuItem, Switch, TextField } from "@mui/material";
import {
  IMPORTED_FILE_KIND_LABELS, IMPORTED_FILE_KINDS, isImportedFileKind, type ImportedFilesFilters as Filters,
} from "../importedFiles.js";
import { selectedValues } from "./filters/selectedValues.js";

interface ImportedFilesFiltersProps {
  filters: Filters;
  yearOptions: string[];
  onChange: (patch: Partial<Filters>) => void;
}

const selectedKinds = (value: unknown) => selectedValues(value).filter(isImportedFileKind);

const renderKinds = (value: unknown): string =>
  selectedKinds(value).map((kind) => IMPORTED_FILE_KIND_LABELS[kind]).join(", ");

export const ImportedFilesFilters = ({ filters, yearOptions, onChange }: ImportedFilesFiltersProps) => (
  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
    <TextField
      select label="Tipo" size="small" sx={{ minWidth: 180 }}
      value={filters.kinds}
      onChange={(event) => onChange({ kinds: selectedKinds(event.target.value) })}
      SelectProps={{ multiple: true, renderValue: renderKinds }}
    >
      {IMPORTED_FILE_KINDS.map((kind) => (
        <MenuItem key={kind} value={kind}>
          <Checkbox size="small" checked={filters.kinds.includes(kind)} />
          <ListItemText primary={IMPORTED_FILE_KIND_LABELS[kind]} />
        </MenuItem>
      ))}
    </TextField>
    <TextField
      select label="Año" size="small" sx={{ minWidth: 120 }}
      value={filters.year}
      onChange={(event) => onChange({ year: event.target.value })}
    >
      <MenuItem value="">Todos</MenuItem>
      {yearOptions.map((year) => (
        <MenuItem key={year} value={year}>{year}</MenuItem>
      ))}
    </TextField>
    <TextField
      label="Buscar archivo o detalle" size="small" sx={{ minWidth: 220 }}
      value={filters.search}
      onChange={(event) => onChange({ search: event.target.value })}
    />
    <FormControlLabel
      label="Solo a revisar"
      control={(
        <Switch
          checked={filters.onlyNeedsReview}
          onChange={(event) => onChange({ onlyNeedsReview: event.target.checked })}
        />
      )}
    />
  </Box>
);
