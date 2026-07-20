import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { AutoPage } from "./AutoPage.js";

function route(url: string) {
  if (url.includes("/auto/summary")) {
    return { grupo: "3684", orden: "97", plan: "K", modelo: "C3 AIRCROSS T200 FEEL PK MY24",
      cuotasPagadas: 4, cuotasTotales: 120, porcentajeAvance: 0.0333, totalPagado: 1428724.71,
      valorActualAuto: 41580000, totalPagadoUsd: 1200, ultimaCuota: 22, fechaUltimoVencimiento: "2026-07-10" };
  }
  if (url.includes("/auto/coupons")) {
    return [{ id: "1", grupo: "3684", orden: "97", cuotaNro: 2, plan: "K", fechaEmision: "2024-10-18",
      fechaVencimiento: "2024-11-11", comprobante: "000062757060", modelo: "C3 AIRCROSS T200 FEEL PK MY24",
      valorMovil: 28240000.01, conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }],
      totalAPagar: 268551.23, tipoCambioUsd: 1000, tipoCambioSource: "api", totalUsd: 268.55 }];
  }
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.restoreAllMocks());

describe("AutoPage", () => {
  it("muestra el título, KPIs y el detalle mes a mes", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto" });
    await waitFor(() => expect(screen.getByText("Total pagado")).toBeInTheDocument());
    expect(screen.getByText("Valor del auto")).toBeInTheDocument();
    expect(screen.getByText("Avance")).toBeInTheDocument();
    expect(screen.getByText("Detalle mes a mes")).toBeInTheDocument();
  });
});
