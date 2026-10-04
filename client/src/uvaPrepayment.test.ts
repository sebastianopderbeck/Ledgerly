import { describe, it, expect } from "vitest";
import type { CreditSummaryDTO, MacroMonth, MacroSeriesDTO } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import { EMPATE_PP, type MacroOption, type MacroVerdict, type VerdictOption } from "./macroSignals.js";
import {
  comisionPosibleHastaCuota, cuadroRestante, duracion, lecturaVeredicto, leerMontoTipeado, prepararSimulador,
  resultadoTiles, simularPrecancelacion, textoAyudaMonto, textoCancelacionTotal, textoLetraChica, textoSaldo, uvaDeHoy,
  type CreditoSimulable, type ModoPrecancelacion, type PrecancelacionResultado, type SimuladorDatos, type UvaDeHoy,
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

const series = (uva: number | null, meses: MacroMonth[] = []): MacroSeriesDTO => ({
  desde: "2025-01",
  meses,
  hoy: { fecha: "2026-10-02", usdOficial: null, uva, tasa30: null },
});

const MESES_CON_INFLACION: MacroMonth[] = [
  { periodo: "2026-08", usdOficial: null, uva: 1990, tasa30: null, inflacion: 2 },
];

const creditoCompleto = (cambios: Partial<CreditSummaryDTO> = {}): CreditSummaryDTO => ({
  prestamoNro: "0000000001", cuotasPagadas: 10, cuotasTotales: 250,
  totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
  capitalOriginalUva: 110000, capitalAmortizadoUva: 10000, capitalPendienteUva: SALDO, capitalPendientePesos: SALDO * 1900,
  porcentajeAvanceCapital: 0.09, cotizacionUvaActual: 1900, cuotaPuraUva: CUOTA, tna: 9, tasaRealMensual: TASA,
  ...cambios,
});

const datosDe = (credito: CreditSummaryDTO, macro: MacroSeriesDTO | undefined): SimuladorDatos => {
  const datos = prepararSimulador(credito, macro);
  if (!datos) throw new Error("el simulador no tiene datos");
  return datos;
};

const LABELS: Record<MacroOption, string> = {
  dolar: "Comprar dólares",
  pesos: "Quedarse en pesos",
  adelantar: "Adelantar capital del crédito",
};

const opcion = (id: MacroOption, retornoReal: number): VerdictOption => ({
  opcion: id, label: LABELS[id], retornoReal, certeza: id === "adelantar" ? "alta" : "media",
});

const veredicto = (...ranking: VerdictOption[]): MacroVerdict => ({ ranking, resumen: "" });

describe("leerMontoTipeado", () => {
  it("lee los montos completos con el parser de la base", () => {
    expect(leerMontoTipeado("20.000.000")).toBe(20_000_000);
    expect(leerMontoTipeado("$ 1.500.000,50")).toBe(1500000.5);
    expect(leerMontoTipeado(" 5000000 ")).toBe(5_000_000);
    expect(leerMontoTipeado("1.5")).toBe(1.5);
    expect(leerMontoTipeado("0")).toBe(0);
  });

  it("acepta montos a medio tipear", () => {
    expect(leerMontoTipeado("20.")).toBe(20);
    expect(leerMontoTipeado("20.000.0")).toBe(200_000);
    expect(leerMontoTipeado("20.000.00")).toBe(2_000_000);
    expect(leerMontoTipeado("1.500.000,")).toBe(1_500_000);
    expect(leerMontoTipeado("$ 20.000.0")).toBe(200_000);
  });

  it("devuelve null si no queda un número", () => {
    expect(leerMontoTipeado("")).toBeNull();
    expect(leerMontoTipeado("abc")).toBeNull();
    expect(leerMontoTipeado("-5")).toBeNull();
    expect(leerMontoTipeado("1,2,3")).toBeNull();
  });
});

describe("uvaDeHoy", () => {
  it("usa la UVA de hoy de las series macro", () => {
    expect(uvaDeHoy(series(2000), { cotizacionUvaActual: 1900 })).toEqual({ valor: 2000, fuente: "hoy" });
  });

  it("sin dato de hoy o sin series usa la cotización del último cupón", () => {
    expect(uvaDeHoy(series(null), { cotizacionUvaActual: 1900 })).toEqual({ valor: 1900, fuente: "ultimoCupon" });
    expect(uvaDeHoy(undefined, { cotizacionUvaActual: 1900 })).toEqual({ valor: 1900, fuente: "ultimoCupon" });
  });
});

describe("comisionPosibleHastaCuota", () => {
  it("avisa hasta un cuarto del plazo o 6 cuotas, lo que sea mayor", () => {
    expect(comisionPosibleHastaCuota({ cuotasPagadas: 10, cuotasTotales: 250 })).toBe(63);
    expect(comisionPosibleHastaCuota({ cuotasPagadas: 2, cuotasTotales: 12 })).toBe(6);
  });

  it("devuelve null cuando ya pasó ese plazo", () => {
    expect(comisionPosibleHastaCuota({ cuotasPagadas: 70, cuotasTotales: 250 })).toBeNull();
    expect(comisionPosibleHastaCuota({ cuotasPagadas: 63, cuotasTotales: 250 })).toBeNull();
  });
});

describe("duracion", () => {
  it.each([
    [1, "1 mes"],
    [12, "1 año"],
    [13, "1 año y 1 mes"],
    [24, "2 años"],
    [54, "4 años y 6 meses"],
  ])("%i meses → %s", (meses, texto) => {
    expect(duracion(meses)).toBe(texto);
  });
});

describe("resultadoTiles", () => {
  it("en reducir plazo muestra capital, intereses y cuotas menos", () => {
    const tiles = resultadoTiles(resultadoDe(20_000_000, "plazo"));
    expect(tiles.map((tile) => tile.id)).toEqual(["capital", "intereses", "cuotas"]);
    expect(tiles.map((tile) => tile.label)).toEqual(["Capital que cancelás", "Intereses que te ahorrás", "Cuotas menos"]);
    expect(tiles[0]).toMatchObject({ value: "10.000,00 UVA", sub: "10,0% del saldo pendiente" });
    expect(tiles[1]).toMatchObject({ value: "38.895,86 UVA", sub: `≈ ${formatMoney(77791710.69, "ARS")} de hoy` });
    expect(tiles[2]).toMatchObject({ value: "54", sub: "Terminás 4 años y 6 meses antes: quedan 186 cuotas" });
  });

  it("en reducir cuota muestra la cuota nueva", () => {
    const tiles = resultadoTiles(resultadoDe(20_000_000, "cuota"));
    expect(tiles.map((tile) => tile.id)).toEqual(["capital", "intereses", "cuota"]);
    expect(tiles[2]).toMatchObject({
      label: "Cuota nueva",
      value: "809,75 UVA",
      sub: `Baja 89,97 UVA ≈ ${formatMoney(179945.19, "ARS")} por mes`,
    });
  });

  it("si no alcanza para una cuota entera explica cuánto baja la última", () => {
    const [, , cuotas] = resultadoTiles(resultadoDe(100 * UVA_HOY, "plazo"));
    expect(cuotas).toMatchObject({ value: "0", sub: "No alcanza para una cuota entera: la última baja a 298,81 UVA" });
  });

  it("cuando queda una sola cuota lo dice en singular", () => {
    const [, , cuotas] = resultadoTiles(resultadoDe(199_000_000, "plazo"));
    expect(cuotas).toMatchObject({ value: "239", sub: "Terminás 19 años y 11 meses antes: queda 1 cuota" });
  });

  it.each<ModoPrecancelacion>(["plazo", "cuota"])("si cancela todo muestra las cuotas menos en los dos modos (%s)", (modo) => {
    const [capital, , cuotas] = resultadoTiles(resultadoDe(300_000_000, modo));
    expect(capital).toMatchObject({ value: "100.000,00 UVA", sub: "100,0% del saldo pendiente" });
    expect(cuotas).toMatchObject({ id: "cuotas", value: "240", sub: "Cancelás el crédito completo" });
  });
});

describe("lecturaVeredicto", () => {
  it("con adelantar primero es la opción que más rinde", () => {
    expect(lecturaVeredicto(veredicto(opcion("adelantar", 9.38), opcion("pesos", 2)), 9.38)).toEqual({
      estado: "mejor",
      texto: "Según Contexto, hoy adelantar capital es la opción que más rinde: +9,4% real anual, y es el único retorno cierto.",
    });
  });

  it("segundo a menos de EMPATE_PP del líder empata con él", () => {
    const lectura = lecturaVeredicto(veredicto(opcion("dolar", 9.38 + EMPATE_PP - 0.1), opcion("adelantar", 9.38)), 9.38);
    expect(lectura).toEqual({
      estado: "mejor",
      texto: "Según Contexto, hoy adelantar capital empata con comprar dólares: +9,4% real anual, y es el único retorno cierto.",
    });
  });

  it("lejos del líder queda superado y lo nombra", () => {
    const lectura = lecturaVeredicto(veredicto(opcion("dolar", 15.2), opcion("adelantar", 9.38), opcion("pesos", 2)), 9.38);
    expect(lectura).toEqual({
      estado: "superado",
      texto: "Según Contexto, hoy comprar dólares rinde más (+15,2% real anual) que adelantar capital (+9,4%). Ese retorno depende de supuestos; el de adelantar es cierto.",
    });
  });

  it("a exactamente EMPATE_PP del líder ya no empata", () => {
    expect(lecturaVeredicto(veredicto(opcion("pesos", 10), opcion("adelantar", 9.5)), 9.5).estado).toBe("superado");
  });

  it("sin veredicto o sin la opción adelantar no compara", () => {
    const texto = "Adelantar capital rinde +9,4% real anual, sea cual sea el monto, y es un retorno cierto. Cargá las series macro para compararlo con el dólar y los pesos.";
    expect(lecturaVeredicto(null, 9.38)).toEqual({ estado: "sinComparar", texto });
    expect(lecturaVeredicto(veredicto(), 9.38)).toEqual({ estado: "sinComparar", texto });
    expect(lecturaVeredicto(veredicto(opcion("dolar", 15), opcion("pesos", 2)), 9.38)).toEqual({ estado: "sinComparar", texto });
  });
});

describe("prepararSimulador", () => {
  it("sin crédito, sin cuadro base o sin UVA no hay simulador", () => {
    expect(prepararSimulador(undefined, series(2000))).toBeNull();
    expect(prepararSimulador(creditoCompleto({ tasaRealMensual: 0 }), series(2000))).toBeNull();
    expect(prepararSimulador(creditoCompleto({ tasaRealMensual: Number.NaN }), series(2000))).toBeNull();
    expect(prepararSimulador(creditoCompleto({ cotizacionUvaActual: 0 }), undefined)).toBeNull();
  });

  it("con series usa la UVA de hoy y arma el veredicto con los supuestos por defecto", () => {
    const datos = datosDe(creditoCompleto(), series(2000, MESES_CON_INFLACION));
    expect(datos.uva).toEqual({ valor: 2000, fuente: "hoy" });
    expect(datos.base.cuotas).toBe(240);
    expect(datos.veredicto.estado).toBe("mejor");
    expect(datos.comisionHastaCuota).toBe(63);
  });

  it("sin series usa la UVA del último cupón y no compara", () => {
    const datos = datosDe(creditoCompleto(), undefined);
    expect(datos.uva).toEqual({ valor: 1900, fuente: "ultimoCupon" });
    expect(datos.veredicto.estado).toBe("sinComparar");
  });
});

describe("textos de la tarjeta", () => {
  const HOY: UvaDeHoy = { valor: 2000, fuente: "hoy" };

  it("textoSaldo resume el saldo de referencia", () => {
    expect(textoSaldo(datosDe(creditoCompleto(), series(2000)))).toBe(
      `Saldo pendiente: 100.000,00 UVA ≈ ${formatMoney(200_000_000, "ARS")} · 240 cuotas de 899,73 UVA · después de la cuota 10.`,
    );
  });

  it("textoAyudaMonto guía, marca el error o muestra las UVA del monto", () => {
    expect(textoAyudaMonto(null, HOY, false)).toBe("En pesos. Se convierte a UVA con la cotización de hoy.");
    expect(textoAyudaMonto(null, HOY, true)).toBe("Ingresá un monto mayor a cero, por ejemplo 5.000.000.");
    expect(textoAyudaMonto(resultadoDe(20_000_000), HOY, false)).toBe(`10.000,00 UVA a ${formatMoney(2000, "ARS")} por UVA`);
    expect(textoAyudaMonto(resultadoDe(300_000_000), HOY, false)).toBe(`150.000,00 UVA a ${formatMoney(2000, "ARS")} por UVA`);
  });

  it("textoAyudaMonto aclara cuando usa la cotización del último cupón", () => {
    const ultimoCupon: UvaDeHoy = { valor: 1900, fuente: "ultimoCupon" };
    expect(textoAyudaMonto(resultadoDe(19_000_000, "plazo", 1900), ultimoCupon, false)).toBe(
      `10.000,00 UVA a ${formatMoney(1900, "ARS")} por UVA (cotización del último cupón)`,
    );
  });

  it("textoCancelacionTotal dice cuánto alcanza y cuánto sobra", () => {
    expect(textoCancelacionTotal(resultadoDe(300_000_000), UVA_HOY)).toBe(
      `Con este monto cancelás todo el crédito: alcanza con ${formatMoney(200_000_000, "ARS")} y te sobran ${formatMoney(100_000_000, "ARS")}.`,
    );
    expect(textoCancelacionTotal(resultadoDe(200_000_000), UVA_HOY)).toBe(
      `Con este monto cancelás todo el crédito: alcanza con ${formatMoney(200_000_000, "ARS")}.`,
    );
  });

  it("textoLetraChica suma el aviso de comisión solo si puede aplicar", () => {
    const base = "Los intereses ahorrados suman lo que dejás de pagar, valuado a la UVA de hoy; no descuentan el paso del tiempo. El seguro de incendio no cambia.";
    expect(textoLetraChica(null)).toBe(base);
    expect(textoLetraChica(63)).toBe(`${base} Hasta la cuota 63 el banco puede cobrar comisión por precancelar; no está incluida.`);
  });
});
