import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup, within } from "@testing-library/react";
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
    const body = url.includes("/stats/monthly") ? [{ month: "2025-11", total: 1, count: 1 }, { month: "2026-05", total: 1, count: 1 }]
      : url.includes("/transactions/categories") ? ["Compras", "Salud"]
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

  it("seleccionar una fila y confirmar dispara POST /transactions/delete con el id", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[1]);
    await userEvent.click(screen.getByRole("button", { name: /borrar seleccionados \(1\)/i }));
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(
        (c) => String(c[0]).includes("/transactions/delete") && (c[1] as RequestInit)?.method === "POST",
      );
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ ids: ["1"] });
    });
  });

  it("manda el año actual al API por defecto y ninguno con year=all", async () => {
    const listUrl = () => vi.mocked(fetch).mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/transactions") && !u.includes("/categories"));
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    expect(listUrl()).toContain(`year=${new Date().getFullYear()}`);
    cleanup();
    vi.mocked(fetch).mockClear();
    renderWithProviders(<TransactionsPage />, { route: "/transactions?year=all" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    expect(listUrl()).not.toContain("year=");
  });

  it("el menú de Año sigue abierto al elegir varios años", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderWithProviders(<TransactionsPage />, { route: "/transactions?year=2026" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("combobox", { name: /año/i }));
    await userEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "2025" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]).includes("year=2025&year=2026"))).toBe(true));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument();
  });
});
