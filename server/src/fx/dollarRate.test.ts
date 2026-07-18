import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOficialRate } from "./dollarRate.js";

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 404, headers: { "Content-Type": "application/json" } });
}
afterEach(() => vi.restoreAllMocks());

describe("fetchOficialRate", () => {
  it("devuelve la venta del día", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ compra: 1000, venta: 1350.5, fecha: "2025-08-18", casa: "oficial" })));
    expect(await fetchOficialRate("2025-08-18")).toBe(1350.5);
  });

  it("retrocede al día anterior si la fecha no tiene dato (404)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("null", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ compra: 1000, venta: 1300, fecha: "2025-08-16", casa: "oficial" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchOficialRate("2025-08-17")).toBe(1300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("devuelve null si fetch lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await fetchOficialRate("2025-08-18")).toBeNull();
  });

  it("devuelve null si no hay dato en el rango de lookback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("null", { status: 404 })));
    expect(await fetchOficialRate("2025-08-18", 3)).toBeNull();
  });
});
