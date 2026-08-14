import { describe, it, expect } from "vitest";
import { buildMonthlySeries, type MacroSeriesPoint } from "./macroSeries.js";

const point = (serie: string, fecha: string, valor: number): MacroSeriesPoint => ({ serie, fecha, valor });

describe("buildMonthlySeries", () => {
  it("toma el último valor de cada mes por serie", () => {
    const result = buildMonthlySeries(
      [
        point("usd_oficial", "2025-01-02", 1000),
        point("usd_oficial", "2025-01-31", 1050),
        point("usd_oficial", "2025-02-28", 1100),
        point("uva", "2025-01-31", 1250),
      ],
      [{ periodo: "2025-01", variacionMensual: 2.2 }],
      "2025-01",
    );
    expect(result.meses).toEqual([
      { periodo: "2025-01", usdOficial: 1050, uva: 1250, tasa30: null, inflacion: 2.2 },
      { periodo: "2025-02", usdOficial: 1100, uva: null, tasa30: null, inflacion: null },
    ]);
  });

  it("deja el mes en curso parcial y lo refleja en hoy", () => {
    const result = buildMonthlySeries(
      [point("usd_oficial", "2026-08-01", 1500), point("usd_oficial", "2026-08-13", 1515)],
      [],
      "2025-01",
    );
    expect(result.meses).toEqual([{ periodo: "2026-08", usdOficial: 1515, uva: null, tasa30: null, inflacion: null }]);
    expect(result.hoy).toEqual({ fecha: "2026-08-13", usdOficial: 1515, uva: null, tasa30: null });
  });

  it("hoy usa la fecha más reciente entre las tres series", () => {
    const result = buildMonthlySeries(
      [
        point("usd_oficial", "2026-08-13", 1515),
        point("uva", "2026-08-14", 2075.56),
        point("tasa30", "2026-08-12", 20.04),
      ],
      [],
      "2025-01",
    );
    expect(result.hoy).toEqual({ fecha: "2026-08-14", usdOficial: 1515, uva: 2075.56, tasa30: 20.04 });
  });

  it("descarta períodos anteriores a desde", () => {
    const result = buildMonthlySeries(
      [point("usd_oficial", "2024-12-31", 900), point("usd_oficial", "2025-01-31", 1050)],
      [{ periodo: "2024-11", variacionMensual: 2.4 }],
      "2025-01",
    );
    expect(result.meses.map((mes) => mes.periodo)).toEqual(["2025-01"]);
  });

  it("sin datos devuelve meses vacío y hoy en null", () => {
    const result = buildMonthlySeries([], [], "2025-01");
    expect(result).toEqual({
      desde: "2025-01",
      meses: [],
      hoy: { fecha: "2025-01", usdOficial: null, uva: null, tasa30: null },
    });
  });
});
