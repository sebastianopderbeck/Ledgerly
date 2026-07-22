import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { TransactionsPage } from "./TransactionsPage.js";

const tx = {
  id: "1", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-05-04",
  descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
  amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
  installmentCurrent: null, installmentTotal: null, comprobante: "1",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/transactions/categories") ? ["Compras", "Salud"]
      : url.includes("/transactions") ? { items: [tx], total: 1, page: 1, pageSize: 50 }
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("TransactionsPage", () => {
  it("renderiza los movimientos en la tabla", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    expect(screen.getByText("Compras")).toBeInTheDocument();
  });

  it("envía las categorías seleccionadas al API", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions?category=Compras&category=Salud" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    const listUrl = vi.mocked(fetch).mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/transactions") && !u.includes("/categories"));
    expect(listUrl).toContain("category=Compras");
    expect(listUrl).toContain("category=Salud");
  });
});
