import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import { CashFlowChart, cashFlowBarColor } from "./CashFlowChart.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const mes = (index: number): CashFlowMonthDTO => ({
  mes: periodo(index),
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
});

const meses = (count: number): CashFlowMonthDTO[] => Array.from({ length: count }, (_unused, index) => mes(index));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

describe("CashFlowChart", () => {
  it("sin meses muestra Sin datos", () => {
    renderWithProviders(<CashFlowChart meses={[]} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByTestId("nivo-chart")).not.toBeInTheDocument();
  });

  it("en mobile muestra a lo sumo 6 meses en el eje y siempre el último", () => {
    emulateMobile();
    renderWithProviders(<CashFlowChart meses={meses(14)} />);
    const { tickValues, margin } = chart();
    expect(tickValues).not.toBeNull();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
    expect(margin).toEqual({ top: 16, right: 24, bottom: 64, left: 56 });
  });

  it("en mobile usa el tooltip compacto", () => {
    emulateMobile();
    renderWithProviders(<CashFlowChart meses={meses(14)} />);
    expect(chart().customTooltip).toBe("yes");
  });

  it("en compu deja que nivo elija las etiquetas", () => {
    emulateDesktop();
    renderWithProviders(<CashFlowChart meses={meses(14)} />);
    expect(chart()).toMatchObject({ tickValues: null, customTooltip: "no", margin: { top: 16, right: 24, bottom: 64, left: 64 } });
  });

  it("usa su propia leyenda y no la de nivo", () => {
    emulateDesktop();
    renderWithProviders(<CashFlowChart meses={meses(3)} />);
    expect(chart().legends).toBe(0);
    const items = within(screen.getByRole("list", { name: "referencias" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Ingreso", "Egresos", "Margen"]);
  });
});

describe("cashFlowBarColor", () => {
  const color = cashFlowBarColor({ ingreso: "#0891b2", egresos: "#d97706", positivo: "#16a34a", negativo: "#dc2626" });

  it("pinta cada serie con su color y el margen según el signo", () => {
    expect(color({ id: "Ingreso", value: 1, data: { estado: "completo" } })).toBe("#0891b2");
    expect(color({ id: "Egresos", value: 1, data: { estado: "completo" } })).toBe("#d97706");
    expect(color({ id: "Margen", value: 10, data: { estado: "completo" } })).toBe("#16a34a");
    expect(color({ id: "Margen", value: -10, data: { estado: "proyectado" } })).toBe("#dc2626");
  });

  it("atenúa las barras de los meses incompletos", () => {
    expect(color({ id: "Egresos", value: 1, data: { estado: "incompleto" } })).toBe("rgba(217, 119, 6, 0.35)");
  });
});
