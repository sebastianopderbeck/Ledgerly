import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Box, Button, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import TuneIcon from "@mui/icons-material/Tune";
import { activeFilterCount, filtersButtonLabel, filtersSummary, type FilterField } from "../../filters/activeFilters.js";
import { FiltersSheet } from "./FiltersSheet.js";
import { SearchFilter } from "./SearchFilter.js";

interface MobileFiltersBarProps {
  fields: FilterField[];
  yearOptions: string[];
}

const rowSx: SxProps<Theme> = { display: "flex", alignItems: "center", gap: 2, minWidth: 0 };

const summarySx: SxProps<Theme> = { flex: 1, minWidth: 0 };

export const MobileFiltersBar = ({ fields, yearOptions }: MobileFiltersBarProps) => {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const openSheet = useCallback(() => setOpen(true), []);
  const closeSheet = useCallback(() => setOpen(false), []);
  const count = activeFilterCount(params, fields);
  const summary = filtersSummary(params, fields);
  const showsSearch = fields.includes("transaction");

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={rowSx}>
        <Badge badgeContent={count} color="primary" slotProps={{ badge: { "aria-hidden": true } }} sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined" startIcon={<TuneIcon />} onClick={openSheet} sx={{ minHeight: 44 }}
            aria-haspopup="dialog" aria-expanded={open} aria-label={filtersButtonLabel(count)}
          >
            Filtros
          </Button>
        </Badge>
        <Typography variant="body2" color="text.secondary" noWrap sx={summarySx}>{summary}</Typography>
      </Box>
      {showsSearch && <Box sx={{ mt: 2 }}><SearchFilter fullWidth touch /></Box>}
      <FiltersSheet open={open} onClose={closeSheet} fields={fields} yearOptions={yearOptions} />
    </Box>
  );
};
