const URL = "https://api.argentinadatos.com/v1/finanzas/indices/inflacion";

interface InflacionRow {
  fecha: string;
  valor: number;
}

export interface InflationSeriesEntry {
  periodo: string;
  variacionMensual: number;
}

export async function fetchInflationSeries(): Promise<InflationSeriesEntry[]> {
  try {
    const res = await fetch(URL);
    if (!res.ok) return [];
    const body = (await res.json()) as InflacionRow[] | null;
    if (!Array.isArray(body)) return [];
    return body
      .filter((row) => typeof row?.valor === "number" && typeof row?.fecha === "string")
      .map((row) => ({ periodo: row.fecha.slice(0, 7), variacionMensual: row.valor }));
  } catch {
    return [];
  }
}
