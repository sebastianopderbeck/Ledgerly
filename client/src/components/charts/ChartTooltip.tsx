import type { CSSProperties } from "react";
import { useTheme } from "@mui/material";
import { LegendSwatch } from "./ChartLegend.js";
import { nivoTheme } from "./nivoTheme.js";

export interface ChartTooltipRow {
  id: string;
  color: string;
  label?: string;
  value: string;
}

interface ChartTooltipProps {
  title: string;
  rows: ChartTooltipRow[];
}

interface LineSlicePoint {
  seriesId: string | number;
  seriesColor: string;
  data: { xFormatted: string; yFormatted: string };
}

interface LineSliceTooltipProps {
  slice: { points: readonly LineSlicePoint[] };
}

interface CompactBarTooltipOptions {
  showKey: boolean;
}

interface CompactBarTooltipProps {
  id: string | number;
  indexValue: string | number;
  color: string;
  formattedValue: string;
}

const TOOLTIP_MAX_WIDTH = 220;

const titleStyle: CSSProperties = { fontWeight: 600 };

const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };

export const ChartTooltip = ({ title, rows }: ChartTooltipProps) => {
  const theme = useTheme();
  const containerStyle: CSSProperties = {
    ...nivoTheme(theme).tooltip?.container,
    maxWidth: TOOLTIP_MAX_WIDTH,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  };

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>{title}</div>
      {rows.map(({ id, color, label, value }) => (
        <div key={id} style={rowStyle}>
          <LegendSwatch color={color} />
          {label && <span>{label}</span>}
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
};

export const LineSliceTooltip = ({ slice }: LineSliceTooltipProps) => {
  const { points } = slice;
  const showSeries = points.length > 1;
  const rows: ChartTooltipRow[] = points.map(({ seriesId, seriesColor, data }) => ({
    id: String(seriesId),
    color: seriesColor,
    label: showSeries ? String(seriesId) : undefined,
    value: String(data.yFormatted),
  }));

  return <ChartTooltip title={points[0]?.data.xFormatted ?? ""} rows={rows} />;
};

export const compactBarTooltip = ({ showKey }: CompactBarTooltipOptions) => {
  const CompactBarTooltip = ({ id, indexValue, color, formattedValue }: CompactBarTooltipProps) => {
    const rows: ChartTooltipRow[] = [
      { id: String(id), color, label: showKey ? String(id) : undefined, value: formattedValue },
    ];
    return <ChartTooltip title={String(indexValue)} rows={rows} />;
  };
  return CompactBarTooltip;
};

export const mobileLineTouch = { enableSlices: "x", sliceTooltip: LineSliceTooltip } as const;
