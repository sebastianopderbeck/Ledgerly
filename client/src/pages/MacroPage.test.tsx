import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { MacroPage } from "./MacroPage.js";

const meses = Array.from({ length: 14 }, (_unused, position) => {
  const mes = position < 12 ? `2025-${String(position + 1).padStart(2, "0")}` : `2026-${String(position - 11).padStart(2, "0")}`;
  return { periodo: mes, usdOficial: 1000 + position * 10, uva: 1000 + position * 20, tasa30: 24, inflacion: 2 };
});

const series = { desde: "2025-01", meses, hoy: { fecha: "2026-02-14", usdOficial: 1100, uva: 1260, tasa30: 24 } };

const summary = {
  prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240,
  totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
  capitalOriginalUva: 1, capitalAmortizadoUva: 1, capitalPendienteUva: 1, capitalPendientePesos: 1,
  porcentajeAvanceCapital: 0.017, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9,
  tasaRealMensual: 0.005,
};

function stubFetch(macroBody: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/macro/series") ? macroBody : url.includes("/credits/summary") ? summary : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

beforeEach(() => stubFetch(series));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MacroPage", () => {
  it("muestra veredicto, señales y gráficos", async () => {
    renderWithProviders(<MacroPage />, { route: "/contexto?year=all" });
    await waitFor(() => expect(screen.getByText("Veredicto del mes")).toBeInTheDocument());
    expect(screen.getByText("Dólar vs su promedio desde 2025")).toBeInTheDocument();
    expect(screen.getByText("Tasa real en pesos")).toBeInTheDocument();
    expect(screen.getByText("Adelantar capital")).toBeInTheDocument();
    expect(screen.getByText("Adelantar capital del crédito")).toBeInTheDocument();
    expect(screen.getByText("Dólar real vs su promedio desde 2025")).toBeInTheDocument();
    expect(screen.getByText("Carrera: UVA vs dólar vs inflación")).toBeInTheDocument();
    expect(screen.getByText("Tasa real en pesos, mes a mes")).toBeInTheDocument();
  });

  it("sin series cargadas invita a actualizar desde la barra", async () => {
    stubFetch({ desde: "2025-01", meses: [], hoy: { fecha: "2025-01", usdOficial: null, uva: null, tasa30: null } });
    renderWithProviders(<MacroPage />, { route: "/contexto?year=all" });
    await waitFor(() => expect(screen.getByText(/botón de actualizar/)).toBeInTheDocument());
  });

  it("ofrece el filtro de Año con los años de las series", async () => {
    renderWithProviders(<MacroPage />, { route: "/contexto?year=all" });
    await userEvent.click(await screen.findByRole("combobox", { name: /año/i }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "2025" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "2026" })).toBeInTheDocument();
    expect(screen.getByText("Veredicto del mes")).toBeInTheDocument();
  });

  it("por defecto filtra los gráficos por el año actual", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00"));
    renderWithProviders(<MacroPage />, { route: "/contexto" });
    await waitFor(() => expect(screen.getByText("Veredicto del mes")).toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: /año/i })).toHaveTextContent("2026");
  });

  it("con un año sin series los gráficos quedan vacíos y el veredicto sigue", async () => {
    renderWithProviders(<MacroPage />, { route: "/contexto?year=2019" });
    await waitFor(() => expect(screen.getByText("Veredicto del mes")).toBeInTheDocument());
    expect(screen.getAllByText("Sin datos")).toHaveLength(3);
  });
});
