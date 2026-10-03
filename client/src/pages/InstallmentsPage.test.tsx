import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { InstallmentsPage } from "./InstallmentsPage.js";

const item = (n: number) => ({
  merchant: "MERCADOLIBRE", category: "Compras", amount: 1500,
  installmentNumber: n, installmentTotal: 4, purchaseDate: "2026-05-04",
});
const detail = [
  { month: "2026-06", total: 1500, count: 1, items: [item(3)] },
  { month: "2026-07", total: 1500, count: 1, items: [item(4)] },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/stats/future-installments/detail") ? detail
      : url.includes("/stats/future-installments") ? [{ month: "2026-06", total: 1500 }, { month: "2026-07", total: 1500 }]
      : url.includes("/transactions/categories") ? []
      : url.includes("/statements") ? []
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const detailUrl = () => vi.mocked(fetch).mock.calls.map((call) => String(call[0])).find((url) => url.includes("/stats/future-installments/detail"));

describe("InstallmentsPage", () => {
  it("en mobile el chip de la cuota va debajo del comercio", async () => {
    emulateMobile();
    renderWithProviders(<InstallmentsPage />, { route: "/installments" });
    const chip = (await screen.findByText("cuota 3/4")).closest(".MuiChip-root")!;
    expect(chip.parentElement!.parentElement).toHaveTextContent("MERCADOLIBRE");
    expect(chip.parentElement!.parentElement).not.toHaveTextContent(/1\.500/);
  });

  it("en compu el chip de la cuota queda al lado del monto", async () => {
    emulateDesktop();
    renderWithProviders(<InstallmentsPage />, { route: "/installments" });
    const chip = (await screen.findByText("cuota 3/4")).closest(".MuiChip-root")!;
    expect(chip.parentElement).not.toHaveTextContent("MERCADOLIBRE");
    expect(chip.parentElement).toHaveTextContent(/1\.500/);
  });

  it("muestra el KPI de cuotas pendientes y la torta por categoría", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments" });
    expect(await screen.findByText("Cuotas pendientes")).toBeInTheDocument();
    expect(screen.getByText("Cuotas pendientes por categoría")).toBeInTheDocument();
  });

  it("pide las cuotas que vencen en el año actual por defecto", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments" });
    await waitFor(() => expect(detailUrl()).toBeDefined());
    expect(detailUrl()).toContain(`year=${new Date().getFullYear()}`);
  });

  it("sin cuotas en los años elegidos lo dice con esos años", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.includes("/stats/future-installments") ? [] : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    renderWithProviders(<InstallmentsPage />, { route: "/installments?year=2024&year=2025" });
    expect(await screen.findByText("No hay cuotas que venzan en 2024 y 2025")).toBeInTheDocument();
  });

  it("pide las cuotas de todos los años elegidos", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments?year=2026&year=2027" });
    await waitFor(() => expect(detailUrl()).toBeDefined());
    expect(detailUrl()).toContain("year=2026&year=2027");
  });
});
