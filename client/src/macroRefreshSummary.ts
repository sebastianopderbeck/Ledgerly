import type { MacroRefreshDTO } from "@ledgerly/shared";

const SERIE_LABELS: Array<[keyof MacroRefreshDTO["series"], string]> = [
  ["usdOficial", "dólar"],
  ["uva", "UVA"],
  ["tasa30", "tasa"],
  ["inflacion", "inflación"],
];

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export function refreshSummaryMessage({ series, tipoCambio }: MacroRefreshDTO): string {
  const counts = Object.values(tipoCambio);
  const puntos = SERIE_LABELS.reduce((total, [key]) => total + series[key], 0);
  const actualizados = counts.reduce((total, { updated }) => total + updated, 0);
  const sinCotizacion = counts.reduce((total, { skipped }) => total + skipped, 0);
  const vacias = SERIE_LABELS.filter(([key]) => series[key] === 0).map(([, label]) => label);

  const parts = [
    "Datos actualizados",
    plural(puntos, "punto de series", "puntos de series"),
    plural(actualizados, "tipo de cambio", "tipos de cambio"),
  ];
  if (vacias.length > 0) parts.push(`sin datos: ${vacias.join(", ")}`);
  if (sinCotizacion > 0) parts.push(`${sinCotizacion} sin cotización`);
  return parts.join(" · ");
}
