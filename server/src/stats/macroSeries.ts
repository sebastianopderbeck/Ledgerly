import type { MacroMonth, MacroSeriesDTO, MacroSpot } from "@ledgerly/shared";

export interface MacroSeriesPoint {
  serie: string;
  fecha: string;
  valor: number;
}

export interface InflationPoint {
  periodo: string;
  variacionMensual: number;
}

type SerieName = "usd_oficial" | "uva" | "tasa30";

function lastByMonth(points: MacroSeriesPoint[], serie: SerieName): Map<string, MacroSeriesPoint> {
  const byMonth = new Map<string, MacroSeriesPoint>();
  for (const point of points) {
    if (point.serie !== serie) continue;
    const periodo = point.fecha.slice(0, 7);
    const current = byMonth.get(periodo);
    if (!current || point.fecha > current.fecha) byMonth.set(periodo, point);
  }
  return byMonth;
}

function latest(byMonth: Map<string, MacroSeriesPoint>): MacroSeriesPoint | null {
  let found: MacroSeriesPoint | null = null;
  for (const point of byMonth.values()) {
    if (!found || point.fecha > found.fecha) found = point;
  }
  return found;
}

export function buildMonthlySeries(
  points: MacroSeriesPoint[],
  inflation: InflationPoint[],
  desde: string,
): MacroSeriesDTO {
  const usd = lastByMonth(points, "usd_oficial");
  const uva = lastByMonth(points, "uva");
  const tasa30 = lastByMonth(points, "tasa30");
  const ipc = new Map(inflation.map((row) => [row.periodo, row.variacionMensual]));

  const periodos = [...new Set([...usd.keys(), ...uva.keys(), ...tasa30.keys(), ...ipc.keys()])]
    .filter((periodo) => periodo >= desde)
    .sort();

  const meses: MacroMonth[] = periodos.map((periodo) => ({
    periodo,
    usdOficial: usd.get(periodo)?.valor ?? null,
    uva: uva.get(periodo)?.valor ?? null,
    tasa30: tasa30.get(periodo)?.valor ?? null,
    inflacion: ipc.get(periodo) ?? null,
  }));

  const spots = [latest(usd), latest(uva), latest(tasa30)];
  const fechas = spots
    .filter((spot): spot is MacroSeriesPoint => spot !== null)
    .map((spot) => spot.fecha)
    .sort();

  const hoy: MacroSpot = {
    fecha: fechas[fechas.length - 1] ?? desde,
    usdOficial: spots[0]?.valor ?? null,
    uva: spots[1]?.valor ?? null,
    tasa30: spots[2]?.valor ?? null,
  };

  return { desde, meses, hoy };
}
