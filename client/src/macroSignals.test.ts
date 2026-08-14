import { describe, it, expect } from "vitest";
import type { CreditSummaryDTO, MacroSeriesDTO } from "@ledgerly/shared";
import {
  dolarRealSeries, tasaRealSeries, inflacionInteranual, variacion12m, raceSeries,
  defaultAssumptions, buildVerdict, buildSignals, buildMacroView, type MacroAssumptions,
} from "./macroSignals.js";

interface MesInput {
  periodo: string;
  usdOficial?: number | null;
  uva?: number | null;
  tasa30?: number | null;
  inflacion?: number | null;
}

interface HoyInput {
  fecha: string;
  usdOficial?: number | null;
  uva?: number | null;
  tasa30?: number | null;
}

const macro = (meses: MesInput[], hoy: HoyInput): MacroSeriesDTO => ({
  desde: meses[0]?.periodo ?? "2025-01",
  meses: meses.map((mes) => ({
    periodo: mes.periodo,
    usdOficial: mes.usdOficial ?? null,
    uva: mes.uva ?? null,
    tasa30: mes.tasa30 ?? null,
    inflacion: mes.inflacion ?? null,
  })),
  hoy: { fecha: hoy.fecha, usdOficial: hoy.usdOficial ?? null, uva: hoy.uva ?? null, tasa30: hoy.tasa30 ?? null },
});

describe("dolarRealSeries", () => {
  it("deflacta el dólar por el IPC de la ventana y lo indexa contra su mediana", () => {
    const result = dolarRealSeries(macro(
      [
        { periodo: "2025-01", usdOficial: 100, inflacion: 0 },
        { periodo: "2025-02", usdOficial: 110, inflacion: 10 },
        { periodo: "2025-03", usdOficial: 100, inflacion: 0 },
      ],
      { fecha: "2025-04-10", usdOficial: 90 },
    ));
    expect(result.mediana).toBeCloseTo(100, 6);
    expect(result.serie.map((punto) => punto.indice)).toEqual([
      expect.closeTo(100, 6), expect.closeTo(100, 6), expect.closeTo(90.9091, 4),
    ]);
    expect(result.ultimoPeriodoConIpc).toBe("2025-03");
    expect(result.indiceHoy).toBeCloseTo(81.8182, 4);
  });

  it("excluye el mes en curso de la mediana y de la serie", () => {
    const result = dolarRealSeries(macro(
      [
        { periodo: "2025-01", usdOficial: 100, inflacion: 0 },
        { periodo: "2025-02", usdOficial: 120, inflacion: 0 },
        { periodo: "2025-03", usdOficial: 500, inflacion: 0 },
      ],
      { fecha: "2025-03-15", usdOficial: 500 },
    ));
    expect(result.serie.map((punto) => punto.periodo)).toEqual(["2025-01", "2025-02"]);
    expect(result.mediana).toBeCloseTo(110, 6);
  });

  it("sin datos devuelve la estructura vacía", () => {
    const result = dolarRealSeries(macro([], { fecha: "2025-01-01" }));
    expect(result).toEqual({ serie: [], mediana: 0, indiceHoy: null, ultimoPeriodoConIpc: null });
  });

  it("sin dólar spot deja indiceHoy en null pero mantiene la serie", () => {
    const result = dolarRealSeries(macro(
      [{ periodo: "2025-01", usdOficial: 100, inflacion: 0 }, { periodo: "2025-02", usdOficial: 100, inflacion: 0 }],
      { fecha: "2025-03-01" },
    ));
    expect(result.indiceHoy).toBeNull();
    expect(result.serie).toHaveLength(2);
  });
});

describe("tasaRealSeries", () => {
  it("compara la tasa mensualizada contra la inflación del mes", () => {
    const result = tasaRealSeries(macro([{ periodo: "2025-01", tasa30: 24, inflacion: 1 }], { fecha: "2025-02-01" }));
    expect(result).toHaveLength(1);
    expect(result[0].tasaReal).toBeCloseTo(0.9901, 4);
  });

  it("saltea los meses sin tasa o sin inflación", () => {
    const result = tasaRealSeries(macro(
      [{ periodo: "2025-01", tasa30: 24 }, { periodo: "2025-02", inflacion: 1 }, { periodo: "2025-03", tasa30: 24, inflacion: 1 }],
      { fecha: "2025-04-01" },
    ));
    expect(result.map((punto) => punto.periodo)).toEqual(["2025-03"]);
  });
});

describe("inflacionInteranual", () => {
  it("compone los últimos 12 meses", () => {
    const meses = Array.from({ length: 12 }, (_unused, position) => ({
      periodo: `2025-${String(position + 1).padStart(2, "0")}`,
      inflacion: 2,
    }));
    expect(inflacionInteranual(macro(meses, { fecha: "2026-01-01" }))).toBeCloseTo(26.8242, 4);
  });

  it("usa solo los últimos 12 cuando hay más historia", () => {
    const meses = [
      { periodo: "2024-12", inflacion: 90 },
      ...Array.from({ length: 12 }, (_unused, position) => ({
        periodo: `2025-${String(position + 1).padStart(2, "0")}`,
        inflacion: 2,
      })),
    ];
    expect(inflacionInteranual(macro(meses, { fecha: "2026-01-01" }))).toBeCloseTo(26.8242, 4);
  });

  it("sin serie devuelve 0", () => {
    expect(inflacionInteranual(macro([], { fecha: "2025-01-01" }))).toBe(0);
  });
});

describe("variacion12m", () => {
  it("mide la carrera UVA vs dólar y el efecto sobre la deuda", () => {
    const meses = Array.from({ length: 13 }, (_unused, position) => ({
      periodo: position < 12 ? `2025-${String(position + 1).padStart(2, "0")}` : "2026-01",
      uva: position === 0 ? 1000 : 1310,
      usdOficial: position === 0 ? 1000 : 1220,
    }));
    const result = variacion12m(macro(meses, { fecha: "2026-01-15" }))!;
    expect(result.meses).toBe(12);
    expect(result.uva).toBeCloseTo(0.31, 6);
    expect(result.usd).toBeCloseTo(0.22, 6);
    expect(result.deuda).toBeCloseTo(0.0738, 4);
  });

  it("devuelve null con menos de dos meses completos", () => {
    expect(variacion12m(macro([{ periodo: "2025-01", uva: 1000, usdOficial: 1000 }], { fecha: "2025-02-01" }))).toBeNull();
  });
});

describe("raceSeries", () => {
  it("indexa las tres series en base 100 al primer mes", () => {
    const result = raceSeries(macro(
      [
        { periodo: "2025-01", usdOficial: 1000, uva: 1000, inflacion: 5 },
        { periodo: "2025-02", usdOficial: 1100, uva: 1200, inflacion: 10 },
      ],
      { fecha: "2025-03-01" },
    ));
    expect(result.map((serie) => serie.id)).toEqual(["Dólar oficial", "UVA", "Inflación"]);
    expect(result[0].data).toEqual([{ x: "2025-01", y: 100 }, { x: "2025-02", y: expect.closeTo(110, 6) }]);
    expect(result[1].data[1].y).toBeCloseTo(120, 6);
    expect(result[2].data[1].y).toBeCloseTo(110, 6);
  });

  it("descarta las series sin ningún dato", () => {
    const result = raceSeries(macro([{ periodo: "2025-01", usdOficial: 1000, inflacion: 0 }], { fecha: "2025-02-01" }));
    expect(result.map((serie) => serie.id)).toEqual(["Dólar oficial", "Inflación"]);
  });
});

const credit = (tasaRealMensual: number): CreditSummaryDTO => ({
  prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240,
  totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
  capitalOriginalUva: 1, capitalAmortizadoUva: 1, capitalPendienteUva: 1, capitalPendientePesos: 1,
  porcentajeAvanceCapital: 0.017, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9,
  tasaRealMensual,
});

const indice80 = macro(
  [{ periodo: "2025-01", usdOficial: 100, inflacion: 0 }, { periodo: "2025-02", usdOficial: 100, inflacion: 0 }],
  { fecha: "2025-03-01", usdOficial: 80, tasa30: 24 },
);

const assumptions = (patch: Partial<MacroAssumptions> = {}): MacroAssumptions => ({
  inflacionEsperada: 20, tasaAnualPesos: 24, reversionMeses: 12, ...patch,
});

describe("defaultAssumptions", () => {
  it("deriva inflación esperada de la serie y tasa del spot", () => {
    const meses = Array.from({ length: 12 }, (_unused, position) => ({
      periodo: `2025-${String(position + 1).padStart(2, "0")}`,
      inflacion: 2,
    }));
    const result = defaultAssumptions(macro(meses, { fecha: "2026-01-05", tasa30: 20.04 }));
    expect(result.inflacionEsperada).toBe(26.8);
    expect(result.tasaAnualPesos).toBe(20.04);
    expect(result.reversionMeses).toBe(12);
  });
});

describe("buildVerdict", () => {
  it("valúa el dólar por reversión a la mediana a 12 meses", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions());
    expect(ranking.find((opcion) => opcion.opcion === "dolar")!.retornoReal).toBeCloseTo(25, 6);
  });

  it("anualiza la reversión cuando el horizonte es 24 meses", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions({ reversionMeses: 24 }));
    expect(ranking.find((opcion) => opcion.opcion === "dolar")!.retornoReal).toBeCloseTo(11.8034, 4);
  });

  it("sin reversión el dólar solo acompaña a la inflación", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions({ reversionMeses: null }));
    expect(ranking.find((opcion) => opcion.opcion === "dolar")!.retornoReal).toBe(0);
  });

  it("calcula la tasa real en pesos desde TNA e inflación esperada", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions());
    expect(ranking.find((opcion) => opcion.opcion === "pesos")!.retornoReal).toBeCloseTo(5.6868, 3);
  });

  it("valúa adelantar capital con la tasa real mensual del crédito", () => {
    const { ranking } = buildVerdict(indice80, credit(0.005), assumptions());
    const adelantar = ranking.find((opcion) => opcion.opcion === "adelantar")!;
    expect(adelantar.retornoReal).toBeCloseTo(6.1678, 3);
    expect(adelantar.certeza).toBe("alta");
  });

  it("ordena por retorno real descendente", () => {
    const { ranking } = buildVerdict(indice80, credit(0.005), assumptions());
    expect(ranking.map((opcion) => opcion.opcion)).toEqual(["dolar", "adelantar", "pesos"]);
  });

  it("sin crédito no ofrece adelantar", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions());
    expect(ranking.map((opcion) => opcion.opcion)).toEqual(["dolar", "pesos"]);
  });

  it("con retornos empatados prefiere el cierto en vez de proclamar un ganador por 0,0%", () => {
    const { ranking, resumen } = buildVerdict(indice80, credit(0.0186), assumptions());
    expect(ranking[0].opcion).toBe("dolar");
    expect(ranking[1].opcion).toBe("adelantar");
    expect(ranking[0].retornoReal - ranking[1].retornoReal).toBeLessThan(0.5);
    expect(resumen).toContain("empatan");
    expect(resumen).toContain("adelantar capital del crédito, que es el único cierto");
    expect(resumen).not.toContain("Le saca");
  });

  it("sin datos devuelve ranking vacío", () => {
    const { ranking, resumen } = buildVerdict(macro([], { fecha: "2025-01-01" }), undefined, assumptions());
    expect(ranking).toEqual([]);
    expect(resumen).toContain("No hay datos");
  });
});

describe("buildSignals", () => {
  it("marca el dólar en verde cuando está por debajo de la banda", () => {
    const señales = buildSignals(indice80, undefined, assumptions());
    const dolar = señales.find((señal) => señal.id === "dolar")!;
    expect(dolar.value).toBeCloseTo(80, 6);
    expect(dolar.status).toBe("good");
    expect(dolar.format).toBe("indice");
    expect(dolar.reading).toContain("por debajo");
  });

  it("marca el dólar en rojo cuando está por encima de la banda", () => {
    const caro = macro(
      [{ periodo: "2025-01", usdOficial: 100, inflacion: 0 }, { periodo: "2025-02", usdOficial: 100, inflacion: 0 }],
      { fecha: "2025-03-01", usdOficial: 130, tasa30: 24 },
    );
    expect(buildSignals(caro, undefined, assumptions()).find((señal) => señal.id === "dolar")!.status).toBe("bad");
  });

  it("marca el dólar en amarillo dentro de la banda", () => {
    const neutro = macro(
      [{ periodo: "2025-01", usdOficial: 100, inflacion: 0 }, { periodo: "2025-02", usdOficial: 100, inflacion: 0 }],
      { fecha: "2025-03-01", usdOficial: 95, tasa30: 24 },
    );
    expect(buildSignals(neutro, undefined, assumptions()).find((señal) => señal.id === "dolar")!.status).toBe("neutral");
  });

  it("pinta la tasa real según su banda", () => {
    const verde = buildSignals(indice80, undefined, assumptions({ inflacionEsperada: 10 }));
    expect(verde.find((señal) => señal.id === "pesos")!.status).toBe("good");
    const rojo = buildSignals(indice80, undefined, assumptions({ inflacionEsperada: 40 }));
    expect(rojo.find((señal) => señal.id === "pesos")!.status).toBe("bad");
  });

  it("le da a adelantar el color de su posición en el ranking", () => {
    const segundo = buildSignals(indice80, credit(0.005), assumptions());
    expect(segundo.find((señal) => señal.id === "adelantar")!.status).toBe("neutral");
    const primero = buildSignals(indice80, credit(0.05), assumptions());
    expect(primero.find((señal) => señal.id === "adelantar")!.status).toBe("good");
  });

  it("marca adelantar en verde cuando empata con el mejor del ranking", () => {
    const señales = buildSignals(indice80, credit(0.0186), assumptions());
    expect(señales.find((señal) => señal.id === "adelantar")!.status).toBe("good");
  });

  it("sin crédito no emite la señal de adelantar", () => {
    expect(buildSignals(indice80, undefined, assumptions()).map((señal) => señal.id)).toEqual(["dolar", "pesos"]);
  });

  it("sin datos no emite ninguna señal", () => {
    expect(buildSignals(macro([], { fecha: "2025-01-01" }), undefined, assumptions())).toEqual([]);
  });
});

describe("buildMacroView", () => {
  it("arma señales, veredicto y series en una sola pasada", () => {
    const view = buildMacroView(indice80, credit(0.005), assumptions());
    expect(view.signals).toHaveLength(3);
    expect(view.verdict.ranking).toHaveLength(3);
    expect(view.dolarReal.indiceHoy).toBeCloseTo(80, 6);
    expect(view.tasaReal).toEqual([]);
  });
});
