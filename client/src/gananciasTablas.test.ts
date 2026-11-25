import { describe, it, expect } from "vitest";
import { TABLAS_GANANCIAS, type TablasAnio } from "./gananciasTablas.js";

const ALICUOTAS = [5, 9, 12, 15, 19, 23, 27, 31, 35];

const GANANCIA_NO_IMPONIBLE_2026 = [
  429316.88, 858633.75, 1287950.63, 1717267.5, 2146584.38, 2575901.25,
  3077540.53, 3579179.81, 4080819.09, 4582458.37, 5084097.65, 5585736.93,
];

const DEDUCCION_ESPECIAL_2026 = [
  2060721.0, 4121442.0, 6182163.01, 8242884.01, 10303605.01, 12364326.01,
  14772194.56, 17180063.1, 19587931.65, 21995800.2, 24403668.74, 26811537.29,
];

const tablas2026 = (): TablasAnio => {
  const tablas = TABLAS_GANANCIAS.get(2026);
  if (!tablas) throw new Error("faltan las tablas de 2026");
  return tablas;
};

describe("TABLAS_GANANCIAS 2026", () => {
  it("tiene 12 meses de 9 tramos con las alícuotas de la escala", () => {
    const { meses } = tablas2026();
    expect(meses).toHaveLength(12);
    for (const { escala } of meses) {
      expect(escala.map((tramo) => tramo.alicuota)).toEqual(ALICUOTAS);
      expect(escala[0]).toMatchObject({ desde: 0, pagaran: 0 });
      expect(escala[escala.length - 1].hasta).toBeNull();
    }
  });

  it("cada tramo continúa el anterior", () => {
    for (const { escala } of tablas2026().meses) {
      for (let i = 0; i < escala.length - 1; i += 1) {
        const tramo = escala[i];
        const siguiente = escala[i + 1];
        expect(tramo.hasta).toBe(siguiente.desde);
        const pagaranEsperado = tramo.pagaran + ((tramo.hasta ?? 0) - tramo.desde) * tramo.alicuota / 100;
        expect(Math.abs(pagaranEsperado - siguiente.pagaran)).toBeLessThan(0.05);
      }
    }
  });

  it("coincide con los valores puntuales de los PDF de ARCA", () => {
    const { meses, topeHipotecarioAnual } = tablas2026();
    expect(meses[0].escala[0].hasta).toBe(166669.17);
    expect(meses[6].escala[8]).toEqual({ desde: 36290871.0, hasta: null, pagaran: 8765066.75, alicuota: 35 });
    expect(meses[11].escala[8]).toEqual({ desde: 65867941.1, hasta: null, pagaran: 15908598.62, alicuota: 35 });
    expect(meses[11].escala[0].hasta).toBe(2168491.89);
    expect(topeHipotecarioAnual).toBe(20000);
  });

  it("tiene las deducciones del art. 30 acumuladas por mes", () => {
    const { meses } = tablas2026();
    expect(meses.map((mes) => mes.gananciaNoImponible)).toEqual(GANANCIA_NO_IMPONIBLE_2026);
    expect(meses.map((mes) => mes.deduccionEspecial)).toEqual(DEDUCCION_ESPECIAL_2026);
  });
});
