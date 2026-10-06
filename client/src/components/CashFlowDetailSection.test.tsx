import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { closedMonths } from "../cashFlow.js";
import { CashFlowDetailSection } from "./CashFlowDetailSection.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const month = (mes: string, overrides: Partial<CashFlowMonthDTO> = {}): CashFlowMonthDTO => ({
  mes,
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
  ...overrides,
});

const meses = [
  month("2026-07"),
  month("2026-08"),
  month("2026-09", { estado: "incompleto", margen: null, tasaAhorro: null, faltantes: ["Resumen ICBC"] }),
  month("2026-10", { estado: "en_curso" }),
  month("2026-11", { estado: "proyectado" }),
  month("2026-12", { estado: "proyectado" }),
];

const historia = closedMonths(meses);

const tableMonths = (): string[] => {
  const table = screen.getByRole("table", { name: "Detalle del flujo de caja" });
  const [, ...rows] = within(table).getAllByRole("row");
  return rows.map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
};

describe("CashFlowDetailSection", () => {
  it("arranca en Actual con el último incompleto, el mes en curso y los proyectados", () => {
    renderWithProviders(<CashFlowDetailSection meses={meses} historia={historia} />);
    expect(screen.getByRole("button", { name: "Actual" })).toHaveAttribute("aria-pressed", "true");
    expect(tableMonths()).toEqual(["Septiembre de 2026", "Octubre de 2026", "Noviembre de 2026", "Diciembre de 2026"]);
  });

  it("en Completos muestra los meses cerrados del más nuevo al más viejo", async () => {
    renderWithProviders(<CashFlowDetailSection meses={meses} historia={historia} />);
    await userEvent.click(screen.getByRole("button", { name: "Completos" }));
    expect(tableMonths()).toEqual(["Septiembre de 2026", "Agosto de 2026", "Julio de 2026"]);
  });

  it("en Proyectados muestra solo los meses proyectados", async () => {
    renderWithProviders(<CashFlowDetailSection meses={meses} historia={historia} />);
    await userEvent.click(screen.getByRole("button", { name: "Proyectados" }));
    expect(tableMonths()).toEqual(["Noviembre de 2026", "Diciembre de 2026"]);
  });

  it("avisa cuando la vista no tiene meses", async () => {
    renderWithProviders(<CashFlowDetailSection meses={meses} historia={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Completos" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No hay meses para mostrar.")).toBeInTheDocument();
  });

  it("en celular filtra las tarjetas", async () => {
    emulateMobile();
    renderWithProviders(<CashFlowDetailSection meses={meses} historia={historia} />);
    expect(screen.getAllByRole("article")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Proyectados" }));
    expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual([
      "Noviembre de 2026",
      "Diciembre de 2026",
    ]);
  });
});
