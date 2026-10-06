import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOficialSeries, fetchRem12mSeries, fetchUvaSeries, fetchTasa30Series, MACRO_START } from "./macroSources.js";

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 404, headers: { "Content-Type": "application/json" } });
}
afterEach(() => vi.restoreAllMocks());

describe("MACRO_START", () => {
  it("recorta la ventana en enero 2025", () => {
    expect(MACRO_START).toBe("2025-01-01");
  });
});

describe("fetchOficialSeries", () => {
  it("mapea venta y descarta lo anterior a la ventana", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([
      { casa: "oficial", compra: 3.97, venta: 3.98, fecha: "2011-01-03" },
      { casa: "oficial", compra: 1000, venta: 1010, fecha: "2025-01-02" },
      { casa: "oficial", compra: 1465, venta: 1515, fecha: "2026-08-13" },
    ])));
    expect(await fetchOficialSeries()).toEqual([
      { fecha: "2025-01-02", valor: 1010 },
      { fecha: "2026-08-13", valor: 1515 },
    ]);
  });

  it("devuelve [] si fetch lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await fetchOficialSeries()).toEqual([]);
  });

  it("devuelve [] si la respuesta no es ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, false)));
    expect(await fetchOficialSeries()).toEqual([]);
  });
});

describe("fetchUvaSeries", () => {
  it("mapea valor y filtra por ventana", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([
      { fecha: "2016-03-31", valor: 14.05 },
      { fecha: "2025-01-02", valor: 1250.3 },
    ])));
    expect(await fetchUvaSeries()).toEqual([{ fecha: "2025-01-02", valor: 1250.3 }]);
  });
});

describe("fetchTasa30Series", () => {
  it("deja el porcentaje como viene", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{ fecha: "2026-08-12", valor: 20.04 }])));
    expect(await fetchTasa30Series()).toEqual([{ fecha: "2026-08-12", valor: 20.04 }]);
  });

  it("normaliza a porcentaje los valores que vienen como fracción", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{ fecha: "2025-01-02", valor: 0.29 }])));
    const result = await fetchTasa30Series();
    expect(result).toHaveLength(1);
    expect(result[0].fecha).toBe("2025-01-02");
    expect(result[0].valor).toBeCloseTo(29, 10);
  });
});

describe("fetchRem12mSeries", () => {
  it("pide la variable 29 del BCRA desde el inicio de la ventana y mapea el detalle en orden", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      status: 200,
      results: [{ idVariable: 29, detalle: [{ fecha: "2026-09-30", valor: 21.1 }, { fecha: "2026-08-31", valor: 21 }] }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchRem12mSeries()).toEqual([
      { fecha: "2026-08-31", valor: 21 },
      { fecha: "2026-09-30", valor: 21.1 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(`https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/29?desde=${MACRO_START}`);
  });

  it("descarta los puntos sin valor numérico", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      results: [{ idVariable: 29, detalle: [{ fecha: "2026-09-30", valor: null }, { fecha: "2026-08-31", valor: 21 }] }],
    })));
    expect(await fetchRem12mSeries()).toEqual([{ fecha: "2026-08-31", valor: 21 }]);
  });

  it("devuelve [] si la respuesta no tiene la forma esperada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: 400, errorMessages: ["boom"] })));
    expect(await fetchRem12mSeries()).toEqual([]);
  });

  it("devuelve [] si fetch lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await fetchRem12mSeries()).toEqual([]);
  });
});
