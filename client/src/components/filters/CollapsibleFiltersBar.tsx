import { useCallback, useId, useState, type ReactNode } from "react";
import { Badge, Box, Button, Collapse, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import TuneIcon from "@mui/icons-material/Tune";
import { filtersButtonLabel } from "../../filters/activeFilters.js";

interface CollapsibleFiltersBarProps {
  search?: ReactNode;
  count: number;
  summary: string;
  children: ReactNode;
}

const rowSx: SxProps<Theme> = { display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" };

const searchSx: SxProps<Theme> = { flex: "1 1 320px", minWidth: 0 };

const summarySx: SxProps<Theme> = { minWidth: 0, flex: "0 1 auto" };

const panelSx: SxProps<Theme> = { display: "flex", gap: 2, flexWrap: "wrap", pt: 2 };

export const CollapsibleFiltersBar = ({ search, count, summary, children }: CollapsibleFiltersBarProps) => {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const togglePanel = useCallback(() => setOpen((current) => !current), []);

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={rowSx}>
        {search && <Box sx={searchSx}>{search}</Box>}
        <Badge badgeContent={count} color="primary" slotProps={{ badge: { "aria-hidden": true } }} sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined" startIcon={<TuneIcon />} onClick={togglePanel}
            aria-expanded={open} aria-controls={panelId} aria-label={filtersButtonLabel(count)}
          >
            Filtros
          </Button>
        </Badge>
        <Typography variant="body2" color="text.secondary" noWrap sx={summarySx}>{summary}</Typography>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box id={panelId} role="group" aria-label="Más filtros" sx={panelSx}>{children}</Box>
      </Collapse>
    </Box>
  );
};
