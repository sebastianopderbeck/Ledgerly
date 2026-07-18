const BASE = "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial";

interface Cotizacion {
  compra: number;
  venta: number;
  fecha: string;
  casa: string;
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

export async function fetchOficialRate(dateIso: string, maxLookbackDays = 7): Promise<number | null> {
  for (let back = 0; back <= maxLookbackDays; back += 1) {
    const [y, m, d] = shiftDate(dateIso, -back).split("-");
    try {
      const res = await fetch(`${BASE}/${y}/${m}/${d}`);
      if (!res.ok) continue;
      const body = (await res.json()) as Cotizacion | null;
      if (body && typeof body.venta === "number") return body.venta;
    } catch {
      return null;
    }
  }
  return null;
}
