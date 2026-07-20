import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { DashboardPage } from "./DashboardPage.js";

function route(url: string) {
  if (url.includes("/statements")) return [
    {
      id: "i1", issuer: "icbc", cardLabel: "ICBC", last4: "1234",
      closingDate: "2026-07-07", dueDate: "2026-07-20",
      totals: {
        totalConsumos: { ars: 0, usd: 0 },
        saldoActual: { ars: 700000, usd: 0 },
        pagoMinimo: { ars: 120000, usd: 0 },
        saldoAnterior: { ars: 0, usd: 0 },
      },
      sourceFileName: "i.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
      transactionCount: 0, uploadedAt: "2026-07-01T00:00:00.000Z",
    },
  ];
  if (url.includes("/fx/oficial")) return { date: "2026-07-20", rate: 1000, source: "oficial" };
  if (url.includes("/stats/monthly-usd")) return [{ month: "2026-05", totalArs: 2000, rate: 1000, totalUsd: 2 }];
  if (url.includes("/stats/summary")) return { currency: "ARS", totalPurchases: 2000, transactionCount: 2, statementCount: 1, futureInstallmentTotal: 3000 };
  if (url.includes("/stats/by-category")) return [{ category: "Compras", total: 1500, count: 1 }];
  if (url.includes("/stats/monthly")) return [{ month: "2026-05", total: 2000, count: 2 }];
  if (url.includes("/stats/future-installments")) return [{ month: "2026-06", total: 1500 }];
  if (url.includes("/stats/top-merchants")) return [{ merchant: "MERCADOLIBRE", total: 1500, count: 1 }];
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.restoreAllMocks());

describe("DashboardPage", () => {
  it("muestra KPIs con el total gastado", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });
    await waitFor(() => expect(screen.getByText(/total gastado/i)).toBeInTheDocument());
    expect(screen.getByText(/gasto por categoría/i)).toBeInTheDocument();
    expect(await screen.findByText("A pagar al cierre")).toBeInTheDocument();
    expect(await screen.findByText("A pagar por mes en USD (al oficial)")).toBeInTheDocument();
    expect(screen.getAllByText((text) => text.includes("≈")).length).toBeGreaterThan(0);
  });
});
