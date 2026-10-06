import type {
  AssetValuationDTO, Currency, ManualAssetCreateDTO, ManualAssetDTO, ManualAssetType, ManualAssetUpdateDTO,
  NetWorthDTO, NetWorthItemDTO, NetWorthMonthDTO, NetWorthTotals,
} from "@ledgerly/shared";
import { formatMoneyInput, parseMoneyInput } from "./moneyInput.js";

export interface AssetDraft {
  nombre: string;
  tipo: ManualAssetType;
  moneda: Currency;
  monto: string;
  fecha: string;
}

export type AssetRequest =
  | { kind: "create"; body: ManualAssetCreateDTO }
  | { kind: "update"; id: string; body: ManualAssetUpdateDTO };

export type NetWorthSerieId = "Activos" | "Pasivos" | "Patrimonio neto";

export interface NetWorthChartPoint {
  x: string;
  y: number;
}

export interface NetWorthChartSerie {
  id: NetWorthSerieId;
  data: NetWorthChartPoint[];
}

export interface ItemsBySide {
  activos: NetWorthItemDTO[];
  pasivos: NetWorthItemDTO[];
}

interface ChartSerieKeys {
  id: NetWorthSerieId;
  keys: Record<Currency, keyof NetWorthTotals>;
}

export const ASSET_TYPE_LABELS: Record<ManualAssetType, string> = {
  cuenta: "Cuenta",
  ahorro: "Ahorros",
  plazo_fijo: "Plazo fijo",
  inversion: "Inversiones",
  inmueble: "Inmueble",
  otro: "Otro",
};

export const ASSET_TYPES: ManualAssetType[] = ["cuenta", "ahorro", "plazo_fijo", "inversion", "inmueble", "otro"];

export const ASSET_NAME_MAX_LENGTH = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CHART_SERIES: ChartSerieKeys[] = [
  { id: "Activos", keys: { ARS: "activosArs", USD: "activosUsd" } },
  { id: "Pasivos", keys: { ARS: "pasivosArs", USD: "pasivosUsd" } },
  { id: "Patrimonio neto", keys: { ARS: "netoArs", USD: "netoUsd" } },
];

export function isAssetType(value: string): value is ManualAssetType {
  return Object.hasOwn(ASSET_TYPE_LABELS, value);
}

export function isCurrency(value: unknown): value is Currency {
  return value === "ARS" || value === "USD";
}

export function itemsBySide(items: NetWorthItemDTO[]): ItemsBySide {
  return {
    activos: items.filter((item) => item.lado === "activo"),
    pasivos: items.filter((item) => item.lado === "pasivo"),
  };
}

export function latestValuation(asset: ManualAssetDTO): AssetValuationDTO | null {
  return asset.valuaciones.reduce<AssetValuationDTO | null>(
    (latest, valuacion) => (!latest || valuacion.fecha > latest.fecha ? valuacion : latest),
    null,
  );
}

export function valuationsNewestFirst(asset: ManualAssetDTO): AssetValuationDTO[] {
  return [...asset.valuaciones].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function assetDraftFrom(asset: ManualAssetDTO | null, today: string): AssetDraft {
  if (!asset) return { nombre: "", tipo: "cuenta", moneda: "ARS", monto: "", fecha: today };
  const ultima = latestValuation(asset);
  return {
    nombre: asset.nombre,
    tipo: asset.tipo,
    moneda: asset.moneda,
    monto: ultima ? formatMoneyInput(ultima.monto) : "",
    fecha: today,
  };
}

const isValidName = (nombre: string): boolean => nombre !== "" && nombre.length <= ASSET_NAME_MAX_LENGTH;

const isValidDate = (fecha: string, today: string): boolean => ISO_DATE.test(fecha) && fecha <= today;

const updateBody = (
  draft: AssetDraft,
  asset: ManualAssetDTO,
  nombre: string,
  valuacion: AssetValuationDTO,
  today: string,
): ManualAssetUpdateDTO => {
  const ultima = latestValuation(asset);
  const valuacionCambio = ultima?.monto !== valuacion.monto || valuacion.fecha !== today;
  return {
    ...(nombre !== asset.nombre ? { nombre } : {}),
    ...(draft.tipo !== asset.tipo ? { tipo: draft.tipo } : {}),
    ...(valuacionCambio ? { valuacion } : {}),
  };
};

export function assetRequest(draft: AssetDraft, asset: ManualAssetDTO | null, today: string): AssetRequest | null {
  const nombre = draft.nombre.trim();
  const monto = parseMoneyInput(draft.monto);
  if (!isValidName(nombre) || monto === null || !isValidDate(draft.fecha, today)) return null;
  const valuacion = { fecha: draft.fecha, monto };
  if (!asset) return { kind: "create", body: { nombre, tipo: draft.tipo, moneda: draft.moneda, valuacion } };
  const body = updateBody(draft, asset, nombre, valuacion, today);
  return Object.keys(body).length > 0 ? { kind: "update", id: asset.id, body } : null;
}

export function netWorthChartSeries(months: NetWorthMonthDTO[], currency: Currency): NetWorthChartSerie[] {
  return CHART_SERIES.map(({ id, keys }) => ({
    id,
    data: months.map((month) => ({ x: month.periodo, y: month[keys[currency]] })),
  }));
}

export function missingPropertyHint(data: NetWorthDTO): boolean {
  const hasMortgage = data.items.some((item) => item.fuente === "hipoteca");
  const hasProperty = data.activosManuales.some((asset) => asset.tipo === "inmueble");
  return hasMortgage && !hasProperty;
}
