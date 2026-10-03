import { Box } from "@mui/material";
import type { FilterField } from "../filters/activeFilters.js";
import { FilterFields } from "./filters/FilterFields.js";

export type { FilterField } from "../filters/activeFilters.js";

interface FiltersBarProps { fields: FilterField[]; yearOptions: string[]; }

export const FiltersBar = ({ fields, yearOptions }: FiltersBarProps) => (
  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
    <FilterFields fields={fields} yearOptions={yearOptions} />
  </Box>
);
