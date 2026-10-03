import { Box } from "@mui/material";
import type { FilterField } from "../filters/activeFilters.js";
import { useIsMobile } from "../useIsMobile.js";
import { FilterFields } from "./filters/FilterFields.js";
import { MobileFiltersBar } from "./filters/MobileFiltersBar.js";

export type { FilterField } from "../filters/activeFilters.js";

interface FiltersBarProps { fields: FilterField[]; yearOptions: string[]; }

export const FiltersBar = ({ fields, yearOptions }: FiltersBarProps) => {
  const isMobile = useIsMobile();

  if (isMobile) return <MobileFiltersBar fields={fields} yearOptions={yearOptions} />;

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
      <FilterFields fields={fields} yearOptions={yearOptions} />
    </Box>
  );
};
