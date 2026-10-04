import { describe, it, expect } from "vitest";
import {
  cuadroRestante, simularPrecancelacion,
  type CreditoSimulable, type ModoPrecancelacion, type PrecancelacionResultado,
} from "./uvaPrepayment.js";

const SALDO = 100000;
const TASA = 0.0075;
const CUOTA = (SALDO * TASA) / (1 - 1.0075 ** -240);
const UVA_HOY = 2000;

const credito: CreditoSimulable = { capitalPendienteUva: SALDO, cuotaPuraUva: CUOTA, tasaRealMensual: TASA };

const simular = (montoPesos: number, modo: ModoPrecancelacion = "plazo", uvaHoy = UVA_HOY) =>
  simularPrecancelacion({ credito, montoPesos, uvaHoy, modo });

const resultadoDe = (montoPesos: number, modo: ModoPrecancelacion = "plazo", uvaHoy = UVA_HOY): PrecancelacionResultado => {
  const resultado = simular(montoPesos, modo, uvaHoy);
  if (!resultado) throw new Error("la simulación no dio resultado");
  return resultado;
};

describe("cuadroRestante", () => {
  it("recorre el cuadro francés que falta pagar", () => {
    const cuadro = cuadroRestante(SALDO, TASA, CUOTA);
    expect(cuadro?.cuotas).toBe(240);
    expect(cuadro?.interesUva).toBeCloseTo(240 * CUOTA - SALDO, 4);
    expect(cuadro?.interesUva).toBeCloseTo(115934.23, 2);
    expect(cuadro?.ultimaCuotaUva).toBeCloseTo(CUOTA, 4);
  });

  it("devuelve null sin tasa, sin saldo, sin cuota o con una cuota que no cubre el interés", () => {
    expect(cuadroRestante(SALDO, 0, CUOTA)).toBeNull();
    expect(cuadroRestante(SALDO, Number.NaN, CUOTA)).toBeNull();
    expect(cuadroRestante(0, TASA, CUOTA)).toBeNull();
    expect(cuadroRestante(SALDO, TASA, 0)).toBeNull();
    expect(cuadroRestante(SALDO, TASA, SALDO * TASA)).toBeNull();
  });

  it("suma a la última cuota un residuo menor al 1 % de la cuota", () => {
    expect(cuadroRestante(SALDO + 1, TASA, CUOTA)?.cuotas).toBe(240);
    expect(cuadroRestante(SALDO + 5, TASA, CUOTA)?.cuotas).toBe(241);
  });

  it("corta un cuadro de más de 600 cuotas", () => {
    expect(cuadroRestante(SALDO, 0.0001, SALDO * 0.0001 + 1)).toBeNull();
  });
});

describe("simularPrecancelacion", () => {
  it("reducir plazo mantiene la cuota y baja la cantidad de cuotas", () => {
    const resultado = resultadoDe(20_000_000, "plazo");
    expect(resultado).toMatchObject({
      modo: "plazo", cancelaTodo: false, montoUva: 10000, capitalCanceladoUva: 10000, porcentajeDelSaldo: 0.1,
      sobrantePesos: 0, cuotasRestantes: 240, cuotasNuevas: 186, cuotasMenos: 54, bajaCuotaUva: 0, bajaCuotaPesos: 0,
    });
    expect(resultado.interesAhorradoUva).toBeCloseTo(38895.86, 2);
    expect(resultado.interesAhorradoPesos).toBeCloseTo(77791710.69, 1);
    expect(resultado.cuotaNuevaUva).toBeCloseTo(CUOTA, 10);
  });

  it("reducir cuota mantiene el plazo y baja la cuota en proporción al saldo", () => {
    const resultado = resultadoDe(20_000_000, "cuota");
    expect(resultado).toMatchObject({ modo: "cuota", cancelaTodo: false, cuotasNuevas: 240, cuotasMenos: 0 });
    expect(resultado.cuotaNuevaUva).toBeCloseTo(809.75, 2);
    expect(resultado.bajaCuotaUva).toBeCloseTo(89.97, 2);
    expect(resultado.bajaCuotaPesos).toBeCloseTo(179945.19, 2);
    expect(resultado.interesAhorradoUva).toBeCloseTo(11593.42, 2);
    expect(resultado.ultimaCuotaUva).toBeCloseTo(CUOTA * 0.9, 4);
  });

  it("con el mismo monto, reducir plazo ahorra más interés que reducir cuota", () => {
    for (const monto of [1_000_000, 20_000_000, 150_000_000]) {
      expect(resultadoDe(monto, "plazo").interesAhorradoUva).toBeGreaterThan(resultadoDe(monto, "cuota").interesAhorradoUva);
    }
  });

  it("con un monto chico en reducir plazo no baja ninguna cuota pero achica la última", () => {
    const resultado = resultadoDe(100 * UVA_HOY, "plazo");
    expect(resultado.cuotasMenos).toBe(0);
    expect(resultado.cuotasNuevas).toBe(240);
    expect(resultado.ultimaCuotaUva).toBeCloseTo(298.81, 2);
  });

  it("un monto chico pero válido da un resultado que casi no mueve nada", () => {
    const resultado = resultadoDe(1.5, "plazo");
    expect(resultado.cuotasMenos).toBe(0);
    expect(resultado.capitalCanceladoUva).toBeCloseTo(0.00075, 8);
  });

  it.each<ModoPrecancelacion>(["plazo", "cuota"])("con un monto mayor al saldo cancela todo el crédito (%s)", (modo) => {
    const resultado = resultadoDe(300_000_000, modo);
    expect(resultado).toMatchObject({
      modo, cancelaTodo: true, montoUva: 150000, capitalCanceladoUva: SALDO, porcentajeDelSaldo: 1,
      sobrantePesos: 100_000_000, cuotasRestantes: 240, cuotasNuevas: 0, cuotasMenos: 240,
      cuotaNuevaUva: 0, bajaCuotaUva: CUOTA, ultimaCuotaUva: 0,
    });
    expect(resultado.interesAhorradoUva).toBeCloseTo(cuadroRestante(SALDO, TASA, CUOTA)?.interesUva ?? 0, 6);
  });

  it("a un centésimo de UVA del saldo ya cancela todo, sin sobrante negativo", () => {
    const resultado = resultadoDe((SALDO - 0.005) * UVA_HOY);
    expect(resultado.cancelaTodo).toBe(true);
    expect(resultado.sobrantePesos).toBe(0);
  });

  it("devuelve null con monto 0 o negativo, sin UVA de hoy o sin cuadro base", () => {
    expect(simular(0)).toBeNull();
    expect(simular(-5)).toBeNull();
    expect(simular(20_000_000, "plazo", 0)).toBeNull();
    expect(simularPrecancelacion({
      credito: { ...credito, tasaRealMensual: 0 }, montoPesos: 20_000_000, uvaHoy: UVA_HOY, modo: "plazo",
    })).toBeNull();
  });
});
