import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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

  it("borrar una fila y confirmar dispara POST /transactions/delete con el id", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /borrar MERCADOLIBRE/i }));
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(
        (c) => String(c[0]).includes("/transactions/delete") && (c[1] as RequestInit)?.method === "POST",
      );
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ ids: ["1"] });
    });
  });
});
