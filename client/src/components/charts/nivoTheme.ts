import type { Theme } from "@mui/material/styles";
import type { PartialTheme } from "@nivo/theming";

export function nivoTheme(theme: Theme): PartialTheme {
  const { palette, typography } = theme;
  const axisColor = palette.text.secondary;

  return {
    background: "transparent",
    text: {
      fontFamily: typography.fontFamily,
      fontSize: 12,
      fill: palette.text.primary,
      outlineWidth: 0,
      outlineColor: "transparent",
    },
    axis: {
      domain: { line: { stroke: palette.divider, strokeWidth: 1 } },
      ticks: {
        line: { stroke: palette.divider, strokeWidth: 1 },
        text: { fill: axisColor, fontSize: 11 },
      },
      legend: { text: { fill: axisColor, fontSize: 12, fontWeight: 600 } },
    },
    grid: { line: { stroke: palette.divider, strokeWidth: 1 } },
    legends: { text: { fill: axisColor, fontSize: 12 } },
    labels: { text: { fill: palette.background.paper, fontWeight: 600 } },
    tooltip: {
      container: {
        background: palette.background.paper,
        color: palette.text.primary,
        fontSize: 12,
        borderRadius: 12,
        border: `1px solid ${palette.divider}`,
        boxShadow: theme.shadows[6],
        padding: "8px 12px",
      },
    },
    crosshair: { line: { stroke: axisColor, strokeWidth: 1, strokeOpacity: 0.5, strokeDasharray: "4 4" } },
  };
}
