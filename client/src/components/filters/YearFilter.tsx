import type { ReactNode } from "react";
import { Checkbox, ListItemText, MenuItem, TextField } from "@mui/material";
import { ALL_YEARS, resolveYearChange, yearOptionsWith } from "../../filters/globalFilters.js";
import { useGlobalFilters } from "../../filters/useGlobalFilters.js";
import { selectedValues } from "./selectedValues.js";

interface YearFilterProps { options: string[]; }

const ALL_LABEL = "Todos";

const renderSelected = (selected: unknown): ReactNode => {
  const values = selectedValues(selected);
  return values.includes(ALL_YEARS) ? ALL_LABEL : values.join(", ");
};

export const YearFilter = ({ options }: YearFilterProps) => {
  const { yearSelection, setYears } = useGlobalFilters();
  const years = yearOptionsWith(options, yearSelection);
  const value = yearSelection.kind === "all" ? [ALL_YEARS] : yearSelection.years;
  const isChecked = (year: string) => yearSelection.kind === "years" && yearSelection.years.includes(year);

  return (
    <TextField
      select label="Año" size="small" sx={{ minWidth: 160 }}
      value={value}
      onChange={(event) => setYears(resolveYearChange(yearSelection, selectedValues(event.target.value)))}
      SelectProps={{ multiple: true, renderValue: renderSelected }}
    >
      <MenuItem value={ALL_YEARS}>
        <Checkbox size="small" checked={yearSelection.kind === "all"} />
        <ListItemText primary={ALL_LABEL} />
      </MenuItem>
      {years.map((year) => (
        <MenuItem key={year} value={year}>
          <Checkbox size="small" checked={isChecked(year)} />
          <ListItemText primary={year} />
        </MenuItem>
      ))}
    </TextField>
  );
};
