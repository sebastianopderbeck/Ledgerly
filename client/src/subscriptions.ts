import type { Cadencia, Currency, SubscriptionDTO, SubscriptionIncrease } from "@ledgerly/shared";
import { ALL_YEARS } from "./filters/globalFilters.js";
import { transactionsLink } from "./filters/transactionsLink.js";
import { formatMoney, formatMonthLabel, formatPercent, formatSignedPercent } from "./format.js";

export type SubscriptionVariant = "activas" | "cortadas";

export interface SubscriptionListProps {
  items: SubscriptionDTO[];
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
  onToggleAnnual: (key: string, annual: boolean) => void;
}

export interface SubscriptionSections {
  activas: SubscriptionDTO[];
  cortadas: SubscriptionDTO[];
  ocultas: SubscriptionDTO[];
  subieron: number;
  ahorroMensualArs: number;
  conUsd: boolean;
}

export const AMOUNT_LABEL: Record<SubscriptionVariant, string> = { activas: "Por mes", cortadas: "Último monto" };

const CURRENCY_NAMES: Record<Currency, string> = { ARS: "pesos", USD: "dólares" };

const OTHER_CADENCE: Record<Cadencia, Cadencia> = { mensual: "anual", anual: "mensual" };

const monthName = (month: string): string => formatMonthLabel(month).toLowerCase();

export function subscriptionSections(items: SubscriptionDTO[]): SubscriptionSections {
  const visibles = items.filter(({ oculta }) => !oculta);
  const activas = visibles.filter(({ estado }) => estado === "activa");
  const cortadas = visibles.filter(({ estado }) => estado === "cortada");
  return {
    activas,
    cortadas,
    ocultas: items.filter(({ oculta }) => oculta),
    subieron: activas.filter(({ aumento }) => aumento !== null).length,
    ahorroMensualArs: cortadas.reduce((total, { montoMensualArs }) => total + (montoMensualArs ?? 0), 0),
    conUsd: activas.some(({ moneda }) => moneda === "USD"),
  };
}

export function subscriptionMeta({ cardLabel, categoria }: Pick<SubscriptionDTO, "cardLabel" | "categoria">): string {
  return `${cardLabel} · ${categoria}`;
}

export function increaseLabel({ variacion, desde }: SubscriptionIncrease): string {
  return `Subió ${formatPercent(variacion * 100)} desde ${monthName(desde)}`;
}

export function increaseShortLabel({ variacion }: SubscriptionIncrease): string {
  return formatSignedPercent(variacion * 100);
}

export function increaseDetail({ montoAnterior }: SubscriptionIncrease, montoActual: number, moneda: Currency): string {
  return `${formatMoney(montoAnterior, moneda)} → ${formatMoney(montoActual, moneda)}`;
}

export function increaseSinceDetail(aumento: SubscriptionIncrease, montoActual: number, moneda: Currency): string {
  return `${increaseDetail(aumento, montoActual, moneda)} desde ${monthName(aumento.desde)}`;
}

export function previousCurrencyLabel(moneda: Currency): string {
  return `Antes se cobraba en ${CURRENCY_NAMES[moneda]}`;
}

export function activeCountLabel(count: number): string {
  return `${count} ${count === 1 ? "activa" : "activas"}`;
}

export function monthlyKpiSub(activas: number, totalMensualUsd: number, cotizacion: number | null): string {
  const base = activeCountLabel(activas);
  if (totalMensualUsd <= 0) return base;
  const usd = formatMoney(totalMensualUsd, "USD");
  return cotizacion === null ? `${base} · sin cotización para ${usd}` : `${base} · incluye ${usd} al oficial`;
}

export function subscriptionTransactionsLink(busqueda: string): string {
  return transactionsLink({ year: ALL_YEARS, search: busqueda });
}

export function cadenceToggleLabel(nombre: string, cadencia: Cadencia): string {
  return `Marcar ${nombre} como ${OTHER_CADENCE[cadencia]}`;
}

export function cadenceToggleTooltip(cadencia: Cadencia): string {
  return `Es ${OTHER_CADENCE[cadencia]}`;
}

export function cadenceAmountCaption(cadencia: Cadencia): string | null {
  return cadencia === "anual" ? "por año" : null;
}
