interface ProbeMargin {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

interface ProbeAxis {
  tickValues?: unknown;
}

interface NivoProbeProps {
  margin?: ProbeMargin;
  axisBottom?: ProbeAxis | null;
  legends?: readonly unknown[];
  colors?: unknown;
}

export interface ProbeReading {
  margin: ProbeMargin | null;
  axisBottom: string | undefined;
  tickValues: unknown[] | null;
  legends: number;
  colors: unknown[] | null;
}

export const NivoProbe = ({ margin, axisBottom, legends, colors }: NivoProbeProps) => (
  <div
    data-testid="nivo-chart"
    data-margin={JSON.stringify(margin ?? null)}
    data-axis-bottom={axisBottom === null ? "none" : "shown"}
    data-tick-values={JSON.stringify(axisBottom?.tickValues ?? null)}
    data-legends={String(legends?.length ?? 0)}
    data-colors={JSON.stringify(Array.isArray(colors) ? colors : null)}
  />
);

export const probeOf = (element: HTMLElement): ProbeReading => ({
  margin: JSON.parse(element.dataset.margin ?? "null") as ProbeMargin | null,
  axisBottom: element.dataset.axisBottom,
  tickValues: JSON.parse(element.dataset.tickValues ?? "null") as unknown[] | null,
  legends: Number(element.dataset.legends),
  colors: JSON.parse(element.dataset.colors ?? "null") as unknown[] | null,
});
