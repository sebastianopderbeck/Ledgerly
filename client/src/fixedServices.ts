import {
  MESES_SERVICIO, isActiveFixedService, isoMonthSchema,
  type FixedServiceCadencia, type FixedServiceCreateDTO, type FixedServiceDTO, type FixedServiceUpdateDTO,
} from "@ledgerly/shared";
import { formatMoneyInput, parseMoneyInput } from "./moneyInput.js";

export type FixedServiceVariant = "activos" | "deBaja";

export interface FixedServiceListProps {
  items: FixedServiceDTO[];
  variant: FixedServiceVariant;
  onEdit: (id: string) => void;
}

export interface FixedServiceDraft {
  nombre: string;
  monto: string;
  cadencia: FixedServiceCadencia;
  desde: string;
  hasta: string;
}

export type FixedServiceRequest =
  | { kind: "create"; body: FixedServiceCreateDTO }
  | { kind: "update"; id: string; body: FixedServiceUpdateDTO };

export interface FixedServiceSections {
  activos: FixedServiceDTO[];
  deBaja: FixedServiceDTO[];
}

export interface FixedServiceKpis {
  porMes: number;
  vigentes: number;
  proximos: number;
}

export const SERVICE_NAME_MAX_LENGTH = 60;

export const FIXED_SERVICE_CADENCIAS: FixedServiceCadencia[] = ["mensual", "bimestral"];

export const CADENCIA_SERVICIO_LABEL: Record<FixedServiceCadencia, string> = { mensual: "Mensual", bimestral: "Bimestral" };

export const SERVICE_LIST_LABEL: Record<FixedServiceVariant, string> = {
  activos: "Servicios activos",
  deBaja: "Servicios dados de baja",
};

export const SERVICE_MONTH_LABEL: Record<FixedServiceVariant, string> = { activos: "Desde", deBaja: "Hasta" };

export const isFixedServiceCadencia = (value: unknown): value is FixedServiceCadencia =>
  FIXED_SERVICE_CADENCIAS.some((cadencia) => cadencia === value);

export const monthlyEquivalent = ({ monto, cadencia }: Pick<FixedServiceDTO, "monto" | "cadencia">): number =>
  monto / MESES_SERVICIO[cadencia];

export const monthlyTotal = (services: FixedServiceDTO[]): number =>
  services.reduce((total, service) => total + monthlyEquivalent(service), 0);

export const fixedServiceSections = (services: FixedServiceDTO[], mesActual: string): FixedServiceSections => ({
  activos: services.filter((service) => isActiveFixedService(service, mesActual)),
  deBaja: services.filter((service) => !isActiveFixedService(service, mesActual)),
});

export const fixedServiceKpis = (activos: FixedServiceDTO[], mesActual: string): FixedServiceKpis => {
  const vigentes = activos.filter((service) => service.desde <= mesActual);
  return { porMes: monthlyTotal(vigentes), vigentes: vigentes.length, proximos: activos.length - vigentes.length };
};

export const activeKpiSub = (proximos: number): string => {
  if (proximos === 0) return "se restan en el Flujo";
  return `${proximos} ${proximos === 1 ? "empieza" : "empiezan"} más adelante`;
};

export const serviceMonth = (variant: FixedServiceVariant, { desde, hasta }: Pick<FixedServiceDTO, "desde" | "hasta">): string =>
  (variant === "deBaja" && hasta !== null ? hasta : desde);

export function fixedServiceDraftFrom(service: FixedServiceDTO | null, mesActual: string): FixedServiceDraft {
  if (!service) return { nombre: "", monto: "", cadencia: "mensual", desde: mesActual, hasta: "" };
  return {
    nombre: service.nombre,
    monto: formatMoneyInput(service.monto),
    cadencia: service.cadencia,
    desde: service.desde,
    hasta: service.hasta ?? "",
  };
}

const isValidName = (nombre: string): boolean => nombre !== "" && nombre.length <= SERVICE_NAME_MAX_LENGTH;

const toCents = (value: number): number => Math.round(value * 100) / 100;

const isMonth = (mes: string): boolean => isoMonthSchema.safeParse(mes).success;

const isValidRange = ({ desde, hasta }: FixedServiceDraft): boolean =>
  isMonth(desde) && (hasta === "" || (isMonth(hasta) && hasta >= desde));

const updateBody = (draft: FixedServiceDraft, service: FixedServiceDTO, nombre: string, monto: number): FixedServiceUpdateDTO => {
  const hasta = draft.hasta === "" ? null : draft.hasta;
  return {
    ...(nombre !== service.nombre ? { nombre } : {}),
    ...(monto !== toCents(service.monto) ? { monto } : {}),
    ...(draft.cadencia !== service.cadencia ? { cadencia: draft.cadencia } : {}),
    ...(draft.desde !== service.desde ? { desde: draft.desde } : {}),
    ...(hasta !== service.hasta ? { hasta } : {}),
  };
};

export function fixedServiceRequest(draft: FixedServiceDraft, service: FixedServiceDTO | null): FixedServiceRequest | null {
  const nombre = draft.nombre.trim();
  const parsed = parseMoneyInput(draft.monto);
  const monto = parsed === null ? null : toCents(parsed);
  if (!isValidName(nombre) || monto === null || monto <= 0 || !isValidRange(draft)) return null;
  if (!service) return { kind: "create", body: { nombre, monto, cadencia: draft.cadencia, desde: draft.desde } };
  const body = updateBody(draft, service, nombre, monto);
  return Object.keys(body).length > 0 ? { kind: "update", id: service.id, body } : null;
}
