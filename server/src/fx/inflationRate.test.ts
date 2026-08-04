import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchInflationSeries } from "./inflationRate.js";

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 404, headers: { "Content-Type": "application/json" } });
}
afterEach(() => vi.restoreAllMocks());

describe("fetchInflationSeries", () => {
  it("mapea fecha->periodo y valor->variacionMensual", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([
      { fecha: "2025-01-31", valor: 2.2 },
      { fecha: "2025-02-28", valor: 2.4 },
    ])));
    expect(await fetchInflationSeries()).toEqual([
      { periodo: "2025-01", variacionMensual: 2.2 },
      { periodo: "2025-02", variacionMensual: 2.4 },
    ]);
  });

  it("devuelve [] si fetch lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await fetchInflationSeries()).toEqual([]);
  });

  it("devuelve [] si la respuesta no es ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, false)));
    expect(await fetchInflationSeries()).toEqual([]);
  });
});
