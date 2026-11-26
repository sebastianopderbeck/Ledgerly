import { useSearchParams } from "react-router-dom";
import { Box } from "@mui/material";
import { filtersSummary, hiddenFilterCount, isCompactFilters, type FilterField } from "../filters/activeFilters.js";
import { useIsMobile } from "../useIsMobile.js";
import { CollapsibleFiltersBar } from "./filters/CollapsibleFiltersBar.js";
import { FilterFields } from "./filters/FilterFields.js";
import { MobileFiltersBar } from "./filters/MobileFiltersBar.js";
import { SearchFilter } from "./filters/SearchFilter.js";

export type { FilterField } from "../filters/activeFilters.js";

interface FiltersBarProps { fields: FilterField[]; yearOptions: string[]; }

export const FiltersBar = ({ fields, yearOptions }: FiltersBarProps) => {
  const isMobile = useIsMobile();
  const [params] = useSearchParams();

  if (isMobile) return <MobileFiltersBar fields={fields} yearOptions={yearOptions} />;

  if (!isCompactFilters(fields)) {
    return (
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
        <FilterFields fields={fields} yearOptions={yearOptions} />
      </Box>
    );
  }

  const search = fields.includes("transaction") ? <SearchFilter fullWidth /> : undefined;

  return (
    <CollapsibleFiltersBar search={search} count={hiddenFilterCount(params, fields)} summary={filtersSummary(params, fields)}>
      <FilterFields fields={fields} yearOptions={yearOptions} withSearch={false} />
    </CollapsibleFiltersBar>
  );
};
