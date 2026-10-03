import { useMemo } from "react";
import { useIsMobile } from "../../useIsMobile.js";

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartLayout {
  isMobile: boolean;
  seriesMargin: (desktop: ChartMargin) => ChartMargin;
  bottomTicks: <T>(values: T[]) => T[] | undefined;
}

const MOBILE_SERIES_LEFT = 56;
const MOBILE_MAX_TICKS = 6;

export const thinTicks = <T,>(values: T[], max: number): T[] => {
  if (values.length <= max) return values;
  const step = Math.ceil(values.length / max);
  const picked: T[] = [];
  for (let index = values.length - 1; index >= 0; index -= step) picked.unshift(values[index]);
  return picked;
};

export const truncateLabel = (label: string, max: number): string =>
  label.length > max ? `${label.slice(0, max - 1)}…` : label;

export function useChartLayout(): ChartLayout {
  const isMobile = useIsMobile();
  return useMemo(
    () => ({
      isMobile,
      seriesMargin: (desktop: ChartMargin) => (isMobile ? { ...desktop, left: MOBILE_SERIES_LEFT } : desktop),
      bottomTicks: <T,>(values: T[]) => (isMobile ? thinTicks(values, MOBILE_MAX_TICKS) : undefined),
    }),
    [isMobile],
  );
}
