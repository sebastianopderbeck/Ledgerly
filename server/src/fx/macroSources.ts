export const MACRO_START = "2025-01-01";

const DOLAR_URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial";
const UVA_URL = "https://api.argentinadatos.com/v1/finanzas/indices/uva";
const TASA_URL = "https://api.argentinadatos.com/v1/finanzas/tasas/depositos30Dias";
const REM_12M_URL = `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/29?desde=${MACRO_START}`;

interface DolarRow {
  fecha: string;
  venta: number;
}

interface ValorRow {
  fecha: string;
  valor: number;
}

interface BcraSeriesBody {
  results?: Array<{ detalle?: Array<{ fecha?: unknown; valor?: unknown }> }>;
}

export interface SeriePoint {
  fecha: string;
  valor: number;
}

async function fetchRows<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const body = (await res.json()) as T[] | null;
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

async function fetchBcraDetail(url: string): Promise<Array<{ fecha?: unknown; valor?: unknown }>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const body = (await res.json()) as BcraSeriesBody | null;
    const detalle = body?.results?.[0]?.detalle;
    return Array.isArray(detalle) ? detalle : [];
  } catch {
    return [];
  }
}

const inWindow = (fecha: unknown): boolean => typeof fecha === "string" && fecha >= MACRO_START;

const toPercent = (valor: number): number => (valor < 1 ? valor * 100 : valor);

export async function fetchOficialSeries(): Promise<SeriePoint[]> {
  const rows = await fetchRows<DolarRow>(DOLAR_URL);
  return rows
    .filter((row) => inWindow(row?.fecha) && typeof row?.venta === "number")
    .map((row) => ({ fecha: row.fecha, valor: row.venta }));
}

export async function fetchUvaSeries(): Promise<SeriePoint[]> {
  const rows = await fetchRows<ValorRow>(UVA_URL);
  return rows
    .filter((row) => inWindow(row?.fecha) && typeof row?.valor === "number")
    .map((row) => ({ fecha: row.fecha, valor: row.valor }));
}

export async function fetchTasa30Series(): Promise<SeriePoint[]> {
  const rows = await fetchRows<ValorRow>(TASA_URL);
  return rows
    .filter((row) => inWindow(row?.fecha) && typeof row?.valor === "number")
    .map((row) => ({ fecha: row.fecha, valor: toPercent(row.valor) }));
}

export async function fetchRem12mSeries(): Promise<SeriePoint[]> {
  const rows = await fetchBcraDetail(REM_12M_URL);
  return rows
    .filter((row): row is SeriePoint => inWindow(row?.fecha) && typeof row?.valor === "number")
    .map(({ fecha, valor }) => ({ fecha, valor }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
