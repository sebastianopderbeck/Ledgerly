import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";
import { formatSignedPercent } from "./format.js";

const TOLERANCIA_AUMENTO_REAL = 0.5;

const BASICO_LABEL = "SUELDO";

export type RaiseVerdict = "real" | "ipc" | "debajo" | "parcial";

export interface SalaryRaise {
  periodo: string;
  basicoPct: number;
  brutoPct: number | null;
  ipcPct: number | null;
  ipcDesde: string;
  ipcHasta: string;
  ipcFaltantes: string[];
  realPct: number | null;
  verdict: RaiseVerdict;
}

interface Ipc {
  pct: number | null;
  faltantes: string[];
}

const toPct = (factor: number): number => (factor - 1) * 100;

const basicoOf = (payslip: PayslipDTO): number | null =>
  payslip.conceptos.find((concepto) => concepto.label.trim().toUpperCase() === BASICO_LABEL)?.monto ?? null;

const sameAmount = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

const nextPeriodo = (periodo: string): string => {
  const [year, month] = periodo.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
};

const previousPeriodo = (periodo: string): string => {
  const [year, month] = periodo.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
};

function periodosBetween(desde: string, hasta: string): string[] {
  const periodos: string[] = [];
  for (let periodo = desde; periodo <= hasta; periodo = nextPeriodo(periodo)) periodos.push(periodo);
  return periodos;
}

function accumulatedIpc(periodos: string[], inflationByPeriodo: Map<string, number>): Ipc {
  let factor = 1;
  let available = 0;
  const faltantes: string[] = [];
  for (const periodo of periodos) {
    const variacion = inflationByPeriodo.get(periodo);
    if (variacion === undefined) {
      faltantes.push(periodo);
    } else {
      factor *= 1 + variacion / 100;
      available += 1;
    }
  }
  return { pct: available > 0 ? toPct(factor) : null, faltantes };
}

function verdictOf(realPct: number | null): RaiseVerdict {
  if (realPct === null) return "parcial";
  if (realPct > TOLERANCIA_AUMENTO_REAL) return "real";
  if (realPct < -TOLERANCIA_AUMENTO_REAL) return "debajo";
  return "ipc";
}

interface RaiseInput {
  payslip: PayslipDTO;
  basico: number;
  lastBasico: number;
  lastAjuste: string;
  previous: PayslipDTO | null;
  inflationByPeriodo: Map<string, number>;
}

function buildRaise({ payslip, basico, lastBasico, lastAjuste, previous, inflationByPeriodo }: RaiseInput): SalaryRaise {
  const ipcHasta = previousPeriodo(payslip.periodo);
  const ipc = accumulatedIpc(periodosBetween(lastAjuste, ipcHasta), inflationByPeriodo);
  const basicoFactor = basico / lastBasico;
  const realPct = ipc.pct !== null && ipc.faltantes.length === 0 ? toPct(basicoFactor / (1 + ipc.pct / 100)) : null;
  const previousBruto = previous?.brutoTotal ?? 0;
  return {
    periodo: payslip.periodo,
    basicoPct: toPct(basicoFactor),
    brutoPct: previousBruto > 0 ? toPct(payslip.brutoTotal / previousBruto) : null,
    ipcPct: ipc.pct,
    ipcDesde: lastAjuste,
    ipcHasta,
    ipcFaltantes: ipc.faltantes,
    realPct,
    verdict: verdictOf(realPct),
  };
}

export function salaryRaises(payslips: PayslipDTO[], inflation: InflationRateDTO[]): Map<string, SalaryRaise> {
  const inflationByPeriodo = new Map(inflation.map(({ periodo, variacionMensual }) => [periodo, variacionMensual]));
  const mensuales = payslips
    .filter((payslip) => payslip.tipo === "mensual")
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  const raises = new Map<string, SalaryRaise>();
  let lastBasico: number | null = null;
  let lastAjuste = "";
  let previous: PayslipDTO | null = null;

  for (const payslip of mensuales) {
    const basico = basicoOf(payslip);
    if (basico !== null && (lastBasico === null || !sameAmount(basico, lastBasico))) {
      if (lastBasico !== null) {
        raises.set(payslip.periodo, buildRaise({ payslip, basico, lastBasico, lastAjuste, previous, inflationByPeriodo }));
      }
      lastBasico = basico;
      lastAjuste = payslip.periodo;
    }
    previous = payslip;
  }
  return raises;
}

export function raiseVerdictLabel({ verdict, realPct }: SalaryRaise): string {
  if (verdict === "parcial" || realPct === null) return "IPC parcial";
  if (verdict === "ipc") return "Solo IPC";
  return `${verdict === "real" ? "Real" : "Debajo"} ${formatSignedPercent(realPct)}`;
}

export function ipcWindowLabel({ ipcDesde, ipcHasta, ipcFaltantes }: SalaryRaise): string {
  const window = ipcDesde === ipcHasta ? ipcDesde : `${ipcDesde} a ${ipcHasta}`;
  return ipcFaltantes.length > 0 ? `${window} · falta ${ipcFaltantes.join(", ")}` : window;
}

export function raiseFor(raises: Map<string, SalaryRaise>, payslip: PayslipDTO): SalaryRaise | undefined {
  return payslip.tipo === "mensual" ? raises.get(payslip.periodo) : undefined;
}
