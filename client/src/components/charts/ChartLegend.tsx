import type { CSSProperties } from "react";
import { Box, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

export interface ChartLegendItem {
  id: string;
  label: string;
  color: string;
  value?: string;
}

interface ChartLegendProps {
  items: ChartLegendItem[];
}

type LegendSwatchVariant = "square" | "dot";

interface LegendSwatchProps {
  color: string;
  variant?: LegendSwatchVariant;
}

const SWATCH_SHAPES: Record<LegendSwatchVariant, CSSProperties> = {
  square: { width: 12, height: 12, borderRadius: 2 },
  dot: { width: 10, height: 10, borderRadius: "50%" },
};

const listSx: SxProps<Theme> = {
  listStyle: "none",
  m: 0,
  mt: 1.5,
  p: 0,
  display: "flex",
  flexWrap: "wrap",
  columnGap: 2,
  rowGap: 0.75,
};

const itemSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 0.75,
  minWidth: 0,
};

export const LegendSwatch = ({ color, variant = "square" }: LegendSwatchProps) => (
  <span
    data-testid="legend-swatch"
    style={{ ...SWATCH_SHAPES[variant], backgroundColor: color, display: "inline-block", flexShrink: 0 }}
  />
);

export const ChartLegend = ({ items }: ChartLegendProps) => (
  <Box component="ul" aria-label="referencias" sx={listSx}>
    {items.map(({ id, label, color, value }) => (
      <Box component="li" key={id} sx={itemSx}>
        <LegendSwatch color={color} variant="dot" />
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        {value && <Typography variant="caption" sx={{ fontWeight: 600 }}>{value}</Typography>}
      </Box>
    ))}
  </Box>
);
