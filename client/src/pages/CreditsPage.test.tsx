import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { CreditsPage } from "./CreditsPage.js";

function route(url: string) {
  if (url.includes("/credits/summary")) {
    return { prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240, totalPagado: 13594820.38,
      capitalPagado: 2378973.78, interesPagado: 11097965.12, seguroPagado: 117881.48, capitalOriginalUva: 78316.73,
      capitalAmortizadoUva: 1355.89, capitalPendienteUva: 76960.84, capitalPendientePesos: 153827014.64,
      porcentajeAvanceCapital: 0.017313, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9 };
  }
  if (url.includes("/credits/coupons")) {
    return [{ id: "1", prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18", capital: 184689.39,
      intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93, cuotaPuraUva: 699.6,
      cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84, tea: 9.27, tna: 8.9, cft: 0 }];
  }
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.restoreAllMocks());

describe("CreditsPage", () => {
  it("muestra KPIs, gráficos y detalle mes a mes", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits" });
    await waitFor(() => expect(screen.getByText(/total pagado/i)).toBeInTheDocument());
    expect(screen.getByText(/capital vs interés por mes/i)).toBeInTheDocument();
    expect(screen.getByText(/detalle mes a mes/i)).toBeInTheDocument();
  });
});
