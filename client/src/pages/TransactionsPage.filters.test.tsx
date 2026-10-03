import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { TransactionsPage } from "./TransactionsPage.js";

const tx = {
  id: "1", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-05-04",
  descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
  amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
  installmentCurrent: null, installmentTotal: null, comprobante: "1",
};
const installmentTx = {
  ...tx, id: "2", descriptionRaw: "CUOTAS SA", merchant: "CUOTAS SA",
  isInstallment: true, installmentCurrent: 1, installmentTotal: 3,
};
const searchedTx = { ...tx, id: "3", descriptionRaw: "UBER TRIP", merchant: "UBER TRIP" };

const listPage = (item: Record<string, unknown>) => ({ items: [item], total: 1, page: 1, pageSize: 50 });

const listFor = (url: string) => {
  if (url.includes("installment=true")) return listPage(installmentTx);
  if (url.includes("search=uber")) return listPage(searchedTx);
  return listPage(tx);
};

const requestedList = (fragment: string) => vi.mocked(fetch).mock.calls
  .map((call) => String(call[0]))
  .some((url) => url.includes("/transactions") && !url.includes("/categories") && url.includes(fragment));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/stats/monthly") ? [{ month: "2026-05", total: 1, count: 1 }]
      : url.includes("/transactions/categories") ? ["Compras", "Salud"]
      : url.includes("/statements") ? [{ id: "s", cardLabel: "ICBC" }]
      : url.includes("/transactions") ? listFor(url)
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  emulateMobile();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Movimientos en mobile: filtros", () => {
  it("elegir Solo cuotas en la hoja vuelve a pedir la lista y la hoja sigue abierta", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await screen.findByText("MERCADOLIBRE");
    await userEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const sheet = screen.getByRole("dialog", { name: "Filtros" });
    await userEvent.click(within(sheet).getByRole("combobox", { name: /cuotas/i }));
    await userEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Solo cuotas" }));
    await waitFor(() => expect(requestedList("installment=true")).toBe(true));
    await screen.findByText("CUOTAS SA");
    expect(screen.getByRole("dialog", { name: "Filtros" })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog", { name: "Filtros" })).getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filtros" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Filtros, 1 activo" })).toBeInTheDocument();
    expect(screen.getByText("2026 · ARS · Solo cuotas")).toBeInTheDocument();
  });

  it("el buscador queda fuera de la hoja y al escribir filtra la lista sin perder el foco", async () => {
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await screen.findByText("MERCADOLIBRE");
    const search = screen.getByRole("textbox", { name: "Buscar comercio" });
    await userEvent.type(search, "uber");
    await waitFor(() => expect(requestedList("search=uber")).toBe(true));
    await screen.findByText("UBER TRIP");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("uber");
  });
});
