import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CashFlowDTO, CashFlowMonthDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { CashFlowPage } from "./CashFlowPage.js";

const base: CashFlowMonthDTO = {
  mes: "2026-08",
  estado: "completo",
  ingreso: 1_000_000,
  conSac: false,
  tarjetas: 500_000,
  hipoteca: 300_000,
  auto: 100_000,
  egresos: 900_000,
  margen: 100_000,
  tasaAhorro: 0.1,
  faltantes: [],
  estimados: [],
};

const dto: CashFlowDTO = {
  mesActual: "2026-10",
  meses: [
    { ...base, mes: "2025-12", conSac: true, ingreso: 1_500_000, margen: 600_000, tasaAhorro: 0.4 },
    base,
    { ...base, mes: "2026-09", estado: "incompleto", margen: null, tasaAhorro: null, faltantes: ["Resumen ICBC"] },
    { ...base, mes: "2026-10", estado: "en_curso", estimados: ["Sueldo (último neto)"] },
    { ...base, mes: "2026-11", estado: "proyectado", estimados: ["Sueldo (último neto)", "Visa Signature (solo cuotas)"] },
  ],
};

const stubFetch = (body: unknown, status = 200) => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00"));
  stubFetch(dto);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CashFlowPage", () => {
  it("muestra el último mes completo y avisa del mes cerrado que sigue incompleto", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    expect(await screen.findByText("Último mes completo: Agosto de 2026")).toBeInTheDocument();
    expect(screen.getByText("Septiembre de 2026 todavía está incompleto: falta Resumen ICBC.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Flujo de caja" })).toBeInTheDocument();
  });

  it("muestra los KPIs, los dos gráficos y la proyección en el detalle", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    expect(await screen.findByText("Egresos conocidos")).toBeInTheDocument();
    expect(screen.getByText("neto de recibos")).toBeInTheDocument();
    expect(screen.getByText("Margen libre")).toBeInTheDocument();
    expect(screen.getByText("Tasa de ahorro")).toBeInTheDocument();
    expect(screen.getByText("promedio 2 meses: 28,0%")).toBeInTheDocument();
    expect(screen.getByText("Ingreso, egresos y margen por mes")).toBeInTheDocument();
    expect(screen.getByText("Próximos 2 meses (estimado)")).toBeInTheDocument();
    expect(screen.getByText(/Los meses incompletos se ven atenuados y sin margen: Sep 2026/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Detalle del flujo de caja" });
    expect(within(table).getByText("Proyectado")).toBeInTheDocument();
    expect(within(table).getByText("En curso")).toBeInTheDocument();
  });

  it("sin meses invita a importar", async () => {
    stubFetch({ mesActual: "2026-10", meses: [] });
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    expect(await screen.findByText(/importá tus recibos de sueldo y al menos un resumen de tarjeta/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("si el server falla lo avisa", async () => {
    stubFetch({ error: "boom" }, 500);
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    expect(await screen.findByText("No se pudo calcular el flujo de caja. Probá de nuevo en un rato.")).toBeInTheDocument();
  });

  it("ofrece el filtro de Año con los años de los meses cerrados", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    await userEvent.click(await screen.findByRole("combobox", { name: /año/i }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "2025" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "2026" })).toBeInTheDocument();
  });

  it("el año filtra solo la historia: la proyección y los KPIs siguen", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=2025" });
    const table = await screen.findByRole("table", { name: "Detalle del flujo de caja" });
    expect(within(table).getByText("Diciembre de 2025")).toBeInTheDocument();
    expect(within(table).getByText("Octubre de 2026")).toBeInTheDocument();
    expect(within(table).getByText("Noviembre de 2026")).toBeInTheDocument();
    expect(within(table).queryByText("Agosto de 2026")).not.toBeInTheDocument();
    expect(within(table).queryByText("Septiembre de 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Último mes completo: Agosto de 2026")).toBeInTheDocument();
  });

  it("con un año sin meses cerrados el gráfico de historia queda vacío y el detalle muestra la proyección", async () => {
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=2019" });
    const table = await screen.findByRole("table", { name: "Detalle del flujo de caja" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByText(/Los meses incompletos/)).not.toBeInTheDocument();
    expect(screen.getByText("Egresos conocidos")).toBeInTheDocument();
  });

  it("en mobile muestra el detalle como tarjetas, sin tabla", async () => {
    emulateMobile();
    renderWithProviders(<CashFlowPage />, { route: "/flujo?year=all" });
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(5));
    expect(screen.getByRole("article", { name: "Noviembre de 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
