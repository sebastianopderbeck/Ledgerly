import type { CreditSummaryDTO } from "@ledgerly/shared";

export const RESIDUO = 0.01;
export const MAX_CUOTAS = 600;
const TOLERANCIA_CANCELACION_UVA = 0.01;

export type ModoPrecancelacion = "plazo" | "cuota";

export interface CuadroRestante {
  cuotas: number;
  interesUva: number;
  ultimaCuotaUva: number;
}

export type CreditoSimulable = Pick<CreditSummaryDTO, "capitalPendienteUva" | "cuotaPuraUva" | "tasaRealMensual">;

export interface PrecancelacionInput {
  credito: CreditoSimulable;
  montoPesos: number;
  uvaHoy: number;
  modo: ModoPrecancelacion;
}

export interface PrecancelacionResultado {
  modo: ModoPrecancelacion;
  cancelaTodo: boolean;
  montoUva: number;
  capitalCanceladoUva: number;
  porcentajeDelSaldo: number;
  sobrantePesos: number;
  interesAhorradoUva: number;
  interesAhorradoPesos: number;
  cuotasRestantes: number;
  cuotasNuevas: number;
  cuotasMenos: number;
  cuotaNuevaUva: number;
  bajaCuotaUva: number;
  bajaCuotaPesos: number;
  ultimaCuotaUva: number;
}

type EfectoPrecancelacion = Pick<
  PrecancelacionResultado,
  "cuotasNuevas" | "cuotasMenos" | "interesAhorradoUva" | "cuotaNuevaUva" | "bajaCuotaUva" | "ultimaCuotaUva"
>;

export function cuadroRestante(saldoUva: number, tasaMensual: number, cuotaUva: number): CuadroRestante | null {
  if (!(saldoUva > 0) || !(tasaMensual > 0) || !(cuotaUva > 0)) return null;

  let saldo = saldoUva;
  let cuotas = 0;
  let interesUva = 0;
  let ultimaCuotaUva = 0;

  while (saldo > 0) {
    const interes = saldo * tasaMensual;
    const amortizacion = cuotaUva - interes;
    if (amortizacion <= 0) return null;

    const cierra = saldo - amortizacion < RESIDUO * cuotaUva;
    ultimaCuotaUva = cierra ? interes + saldo : cuotaUva;
    saldo = cierra ? 0 : saldo - amortizacion;
    cuotas += 1;
    interesUva += interes;
    if (cuotas > MAX_CUOTAS) return null;
  }

  return { cuotas, interesUva, ultimaCuotaUva };
}

const cancelacionTotal = (base: CuadroRestante, cuotaUva: number): EfectoPrecancelacion => ({
  cuotasNuevas: 0,
  cuotasMenos: base.cuotas,
  interesAhorradoUva: base.interesUva,
  cuotaNuevaUva: 0,
  bajaCuotaUva: cuotaUva,
  ultimaCuotaUva: 0,
});

function reducirPlazo(base: CuadroRestante, saldoNuevo: number, credito: CreditoSimulable): EfectoPrecancelacion | null {
  const nuevo = cuadroRestante(saldoNuevo, credito.tasaRealMensual, credito.cuotaPuraUva);
  if (!nuevo) return null;
  return {
    cuotasNuevas: nuevo.cuotas,
    cuotasMenos: base.cuotas - nuevo.cuotas,
    interesAhorradoUva: base.interesUva - nuevo.interesUva,
    cuotaNuevaUva: credito.cuotaPuraUva,
    bajaCuotaUva: 0,
    ultimaCuotaUva: nuevo.ultimaCuotaUva,
  };
}

function reducirCuota(base: CuadroRestante, saldoNuevo: number, credito: CreditoSimulable): EfectoPrecancelacion {
  const factor = saldoNuevo / credito.capitalPendienteUva;
  const cuotaNuevaUva = credito.cuotaPuraUva * factor;
  return {
    cuotasNuevas: base.cuotas,
    cuotasMenos: 0,
    interesAhorradoUva: base.interesUva * (1 - factor),
    cuotaNuevaUva,
    bajaCuotaUva: credito.cuotaPuraUva - cuotaNuevaUva,
    ultimaCuotaUva: base.ultimaCuotaUva * factor,
  };
}

function efectoDe(
  modo: ModoPrecancelacion,
  cancelaTodo: boolean,
  base: CuadroRestante,
  saldoNuevo: number,
  credito: CreditoSimulable,
): EfectoPrecancelacion | null {
  if (cancelaTodo) return cancelacionTotal(base, credito.cuotaPuraUva);
  return modo === "plazo" ? reducirPlazo(base, saldoNuevo, credito) : reducirCuota(base, saldoNuevo, credito);
}

export function simularPrecancelacion({ credito, montoPesos, uvaHoy, modo }: PrecancelacionInput): PrecancelacionResultado | null {
  const saldo = credito.capitalPendienteUva;
  const base = cuadroRestante(saldo, credito.tasaRealMensual, credito.cuotaPuraUva);
  if (!base || !(montoPesos > 0) || !(uvaHoy > 0)) return null;

  const montoUva = montoPesos / uvaHoy;
  const cancelaTodo = montoUva >= saldo - TOLERANCIA_CANCELACION_UVA;
  const capitalCanceladoUva = cancelaTodo ? saldo : montoUva;
  const efecto = efectoDe(modo, cancelaTodo, base, saldo - capitalCanceladoUva, credito);
  if (!efecto) return null;

  return {
    modo,
    cancelaTodo,
    montoUva,
    capitalCanceladoUva,
    porcentajeDelSaldo: capitalCanceladoUva / saldo,
    sobrantePesos: cancelaTodo ? Math.max(0, montoPesos - saldo * uvaHoy) : 0,
    cuotasRestantes: base.cuotas,
    ...efecto,
    interesAhorradoPesos: efecto.interesAhorradoUva * uvaHoy,
    bajaCuotaPesos: efecto.bajaCuotaUva * uvaHoy,
  };
}
