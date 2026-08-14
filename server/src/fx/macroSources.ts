export const MACRO_START = "2025-01-01";

const DOLAR_URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial";
const UVA_URL = "https://api.argentinadatos.com/v1/finanzas/indices/uva";
const TASA_URL = "https://api.argentinadatos.com/v1/finanzas/tasas/depositos30Dias";

interface DolarRow {
  fecha: string;
  venta: number;
}

interface ValorRow {
  fecha: string;
  valor: number;
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
