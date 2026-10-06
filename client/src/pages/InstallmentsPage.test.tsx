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
const purchases = [{
  id: "ICBC|2026-01-15|MERCADOLIBRE|3|1", cardLabel: "ICBC", merchant: "MERCADOLIBRE", category: "Compras",
  purchaseDate: "2026-01-15", installmentTotal: 3,
  installments: [
    { number: 1, amount: 1000, paymentDate: "2026-02-10" },
    { number: 2, amount: 1000, paymentDate: "2026-03-10" },
    { number: 3, amount: 1000, paymentDate: "2026-04-10" },
  ],
}];
const inflation = [{ periodo: "2026-02", variacionMensual: 2 }, { periodo: "2026-03", variacionMensual: 2 }];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/stats/installment-purchases") ? purchases
      : url.includes("/inflation") ? inflation
      : url.includes("/stats/future-installments/detail") ? detail
      : url.includes("/stats/future-installments") ? [{ month: "2026-06", total: 1500 }, { month: "2026-07", total: 1500 }]
      : url.includes("/transactions/categories") ? []
      : url.includes("/statements") ? []
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const detailUrl = () => vi.mocked(fetch).mock.calls.map((call) => String(call[0])).find((url) => url.includes("/stats/future-installments/detail"));
const savingsRegion = () => screen.queryByRole("region", { name: "Cuánto te ahorran las cuotas" });

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

  it("muestra el ahorro de las cuotas en pesos entre los gráficos y el detalle por mes", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments?year=2026" });
    expect(await screen.findByText("Ahorro real")).toBeInTheDocument();
    const region = savingsRegion()!;
    const charts = screen.getByText("Cuotas pendientes por categoría");
    const firstMonth = screen.getByText("Junio de 2026");
    expect(charts.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(firstMonth) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("con dólares no muestra el ahorro de las cuotas", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments?currency=USD" });
    expect(await screen.findByText("Cuotas pendientes")).toBeInTheDocument();
    expect(savingsRegion()).not.toBeInTheDocument();
  });

  it("muestra el ahorro aunque no haya cuotas pendientes en los años elegidos", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.includes("/stats/installment-purchases") ? purchases
        : url.includes("/inflation") ? inflation
        : url.includes("/stats/future-installments") ? []
        : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    renderWithProviders(<InstallmentsPage />, { route: "/installments?year=2026" });
    expect(await screen.findByText("No hay cuotas que venzan en 2026")).toBeInTheDocument();
    expect(await screen.findByText("Ahorro real")).toBeInTheDocument();
    expect(savingsRegion()).toBeInTheDocument();
  });
});
