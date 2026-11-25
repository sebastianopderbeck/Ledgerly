import { describe, it, expect } from "vitest";
import type { PayslipConceptoDTO, PayslipDTO } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import { TABLAS_GANANCIAS, type TablasAnio, type TablasMes } from "./gananciasTablas.js";
import {
  ajusteAnioAnteriorTexto,
  avisoRetencionTexto,
  impuestoSegunEscala,
  mesDeCobro,
  retencionGanancias,
  veredictoRetencion,
  type ResultadoRetencion,
} from "./gananciasRetencion.js";

const mesSintetico = (mes: number): TablasMes => ({
  escala: [{ desde: 0, hasta: null, pagaran: 0, alicuota: 10 }],
  gananciaNoImponible: 100 * mes,
  deduccionEspecial: 1100 * mes,
});

const tablasSinteticas = (cantidadMeses = 12): ReadonlyMap<number, TablasAnio> =>
  new Map([[2026, {
    meses: Array.from({ length: cantidadMeses }, (_, indice) => mesSintetico(indice + 1)),
    topeHipotecarioAnual: 1200,
  }]]);

interface ReciboInput {
  remunerativo?: number;
  aporte?: number;
  retencion?: number;
  extra?: PayslipConceptoDTO[];
}

const descuento = (codigo: string, monto: number): PayslipConceptoDTO => ({ codigo, label: codigo, tipo: "descuento", monto });

const recibo = (periodo: string, tipo: PayslipDTO["tipo"], { remunerativo = 12000, aporte = 1200, retencion = 1030, extra = [] }: ReciboInput = {}): PayslipDTO => ({
  id: `${periodo}-${tipo}`, periodo, tipo, fechaPago: `${periodo}-28`, cuil: "20-1-3",
  conceptos: [
    { codigo: tipo === "sac" ? "0253" : "0201", label: "SUELDO", tipo: "remunerativo", monto: remunerativo },
    descuento("0403", aporte),
    descuento("0430", retencion),
    ...extra,
  ],
  remunerativo, noRemunerativo: 0, descuentos: 0, brutoTotal: remunerativo, neto: remunerativo,
  costoTotalEmpleador: null, tipoCambioUsd: null, tipoCambioSource: null, netoUsd: null,
});

const periodos = (desde: string, hasta: string): string[] => {
  const indice = (periodo: string) => Number(periodo.slice(0, 4)) * 12 + Number(periodo.slice(5, 7)) - 1;
  return Array.from({ length: indice(hasta) - indice(desde) + 1 }, (_, i) => {
    const total = indice(desde) + i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
};

const mensuales = (desde: string, hasta: string, input?: ReciboInput): PayslipDTO[] =>
  periodos(desde, hasta).map((periodo) => recibo(periodo, "mensual", input));

const sacJunio = (input: ReciboInput = { remunerativo: 6000, aporte: 600, retencion: 0 }): PayslipDTO =>
  recibo("2026-06", "sac", input);

const calculado = (resultado: ResultadoRetencion) => {
  if (resultado.estado !== "calculado") throw new Error(`estado inesperado: ${resultado.estado}`);
  return resultado;
};

describe("mesDeCobro", () => {
  it("el sueldo de diciembre se cobra en enero del año siguiente", () => {
    expect(mesDeCobro({ periodo: "2025-12", tipo: "mensual" })).toEqual({ anio: 2026, mes: 1 });
  });

  it("un sueldo mensual se cobra el mes siguiente", () => {
    expect(mesDeCobro({ periodo: "2026-05", tipo: "mensual" })).toEqual({ anio: 2026, mes: 6 });
  });

  it("el SAC se cobra en el mes de su período", () => {
    expect(mesDeCobro({ periodo: "2026-06", tipo: "sac" })).toEqual({ anio: 2026, mes: 6 });
    expect(mesDeCobro({ periodo: "2026-12", tipo: "sac" })).toEqual({ anio: 2026, mes: 12 });
  });
});

describe("impuestoSegunEscala", () => {
  const escalaEnero = TABLAS_GANANCIAS.get(2026)?.meses[0].escala ?? [];

  it("aplica el tramo que corresponde", () => {
    expect(impuestoSegunEscala(escalaEnero, 1000000)).toBeCloseTo(128332.41, 2);
  });

  it("el borde superior de un tramo queda en ese tramo", () => {
    expect(impuestoSegunEscala(escalaEnero, 166669.17)).toBeCloseTo(8333.46, 2);
  });

  it("aplica el último tramo en adelante", () => {
    expect(impuestoSegunEscala(escalaEnero, 6000000)).toBeCloseTo(1550825.07, 2);
  });

  it("sin ganancia neta no hay impuesto", () => {
    expect(impuestoSegunEscala(escalaEnero, 0)).toBe(0);
    expect(impuestoSegunEscala(escalaEnero, -500)).toBe(0);
  });
});

describe("veredictoRetencion", () => {
  it("coincide hasta el 1 % del esperado, borde incluido", () => {
    expect(veredictoRetencion(10, 1000)).toBe("coincide");
  });

  it("de más o de menos fuera de la tolerancia", () => {
    expect(veredictoRetencion(10.01, 1000)).toBe("de_mas");
    expect(veredictoRetencion(-10.01, 1000)).toBe("de_menos");
  });

  it("sin impuesto esperado, solo coincide si no se retuvo nada", () => {
    expect(veredictoRetencion(0, 0)).toBe("coincide");
    expect(veredictoRetencion(50, 0)).toBe("de_mas");
  });
});

describe("retencionGanancias", () => {
  it("sin recibos", () => {
    expect(retencionGanancias([], tablasSinteticas())).toEqual({ estado: "sin_recibos" });
  });

  it("doceavas: el SAC de junio reemplaza las doceavas", () => {
    const { meses } = calculado(retencionGanancias([...mensuales("2025-12", "2026-06"), sacJunio()], tablasSinteticas()));
    expect(meses.map((mes) => mes.esperado)).toEqual([1030, 2060, 3090, 4120, 5150, 6180, 7210]);
    expect(meses.every((mes) => mes.veredicto === "coincide")).toBe(true);
  });

  it("un SAC distinto de seis doceavas cambia junio", () => {
    const sac = sacJunio({ remunerativo: 9000, aporte: 900, retencion: 0 });
    const { meses } = calculado(retencionGanancias([...mensuales("2025-12", "2026-06"), sac], tablasSinteticas()));
    expect(meses[5].esperado).toBe(6450);
    expect(meses[6].esperado).toBe(7480);
  });

  it("cuenta la devolución con su signo y deja afuera el 0446", () => {
    const base = calculado(retencionGanancias(mensuales("2025-12", "2026-04"), tablasSinteticas()));
    const conAjustes = mensuales("2025-12", "2026-04").map((payslip) => (payslip.periodo === "2026-03"
      ? recibo("2026-03", "mensual", { extra: [descuento("0433", -500), descuento("0446", -3000)] })
      : payslip));
    const resultado = calculado(retencionGanancias(conAjustes, tablasSinteticas()));
    expect(resultado.meses[3].retenido).toBe(base.meses[3].retenido - 500);
    expect(resultado.ajusteAnioAnterior).toEqual({ anio: 2025, monto: -3000 });
    expect(base.ajusteAnioAnterior).toBeNull();
  });

  it("hueco a mitad de año: calcula hasta el mes anterior y avisa", () => {
    const sinFebrero = mensuales("2025-12", "2026-04").filter((payslip) => payslip.periodo !== "2026-02");
    const resultado = calculado(retencionGanancias(sinFebrero, tablasSinteticas()));
    expect(resultado.meses).toHaveLength(2);
    expect(resultado.avisos).toEqual([{ tipo: "falta_recibo", periodo: "2026-02", sac: false, hastaMes: 2 }]);
  });

  it("SAC de junio sin el sueldo de mayo es un hueco en junio", () => {
    const resultado = calculado(retencionGanancias([...mensuales("2025-12", "2026-04"), sacJunio()], tablasSinteticas()));
    expect(resultado.meses).toHaveLength(5);
    expect(resultado.avisos).toEqual([{ tipo: "falta_recibo", periodo: "2026-05", sac: false, hastaMes: 5 }]);
  });

  it("falta el SAC de junio", () => {
    const resultado = calculado(retencionGanancias(mensuales("2025-12", "2026-06"), tablasSinteticas()));
    expect(resultado.meses).toHaveLength(5);
    expect(resultado.avisos).toEqual([{ tipo: "falta_recibo", periodo: "2026-06", sac: true, hastaMes: 5 }]);
  });

  it("hueco en enero: ningún mes calculable", () => {
    const resultado = calculado(retencionGanancias(mensuales("2026-01", "2026-03"), tablasSinteticas()));
    expect(resultado.meses).toEqual([]);
    expect(resultado.avisos).toEqual([{ tipo: "falta_recibo", periodo: "2025-12", sac: false, hastaMes: 0 }]);
  });

  it("el mes en curso sin cobrar no es hueco", () => {
    const resultado = calculado(retencionGanancias(mensuales("2025-12", "2026-03"), tablasSinteticas()));
    expect(resultado.meses).toHaveLength(4);
    expect(resultado.avisos).toEqual([]);
  });

  it("faltan tablas desde julio", () => {
    const resultado = calculado(retencionGanancias([...mensuales("2025-12", "2026-07"), sacJunio()], tablasSinteticas(6)));
    expect(resultado.meses).toHaveLength(6);
    expect(resultado.avisos).toEqual([{ tipo: "faltan_tablas", desdeMes: 7 }]);
  });

  it("el sueldo de diciembre pasa al año siguiente", () => {
    const recibos = [...mensuales("2025-12", "2026-12"), sacJunio()];
    expect(retencionGanancias(recibos, tablasSinteticas())).toEqual({ estado: "sin_tablas", anio: 2027 });
  });

  it("ganancia neta negativa da impuesto 0", () => {
    const { meses } = calculado(retencionGanancias(mensuales("2025-12", "2026-02", { remunerativo: 100, aporte: 10, retencion: 0 }), tablasSinteticas()));
    expect(meses.map((mes) => mes.esperado)).toEqual([0, 0, 0]);
    expect(meses.every((mes) => mes.veredicto === "coincide")).toBe(true);
  });

  it("marca cambio de tablas en enero y julio", () => {
    const { meses } = calculado(retencionGanancias([...mensuales("2025-12", "2026-06"), sacJunio()], tablasSinteticas()));
    expect(meses.filter((mes) => mes.cambioDeTablas).map((mes) => mes.mes)).toEqual([1, 7]);
  });

  it("etiqueta los recibos de cada mes", () => {
    const { meses } = calculado(retencionGanancias([...mensuales("2025-12", "2026-06"), sacJunio()], tablasSinteticas()));
    expect(meses[0].recibos).toEqual(["Dic 2025"]);
    expect(meses[5].recibos).toEqual(["May 2026", "SAC Jun 2026"]);
  });

  it("calcula la diferencia como retenido menos esperado", () => {
    const { meses } = calculado(retencionGanancias(mensuales("2025-12", "2026-01", { retencion: 1100 }), tablasSinteticas()));
    expect(meses[0]).toMatchObject({ esperado: 1030, retenido: 1100, diferencia: 70, veredicto: "de_mas" });
  });
});

describe("textos", () => {
  it("aviso de recibo faltante", () => {
    expect(avisoRetencionTexto({ tipo: "falta_recibo", periodo: "2026-03", sac: false, hastaMes: 3 }, 2026))
      .toBe("Falta el recibo de marzo 2026: la cuenta llega hasta marzo.");
  });

  it("aviso de SAC faltante", () => {
    expect(avisoRetencionTexto({ tipo: "falta_recibo", periodo: "2026-06", sac: true, hastaMes: 5 }, 2026))
      .toContain("SAC de junio 2026");
  });

  it("aviso sin ningún mes calculable", () => {
    const texto = avisoRetencionTexto({ tipo: "falta_recibo", periodo: "2025-12", sac: false, hastaMes: 0 }, 2026);
    expect(texto).toContain("diciembre 2025");
    expect(texto).not.toContain("llega hasta");
  });

  it("aviso de tablas faltantes", () => {
    expect(avisoRetencionTexto({ tipo: "faltan_tablas", desdeMes: 7 }, 2026)).toContain("julio 2026");
  });

  it("ajuste de la liquidación anual del año anterior", () => {
    expect(ajusteAnioAnteriorTexto({ anio: 2025, monto: -3000 }, 2026))
      .toBe(`Ajuste de la liquidación anual 2025: ${formatMoney(-3000, "ARS")} (no entra en la cuenta de 2026)`);
  });
});
