import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import type { RealSpendingPoint } from "../../realSpending.js";
import { seriesColor } from "./palette.js";
import { RealSpendingChart } from "./RealSpendingChart.js";

vi.mock("@nivo/line", async () => ({ ResponsiveLine: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const month = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const points = (count: number): RealSpendingPoint[] =>
  Array.from({ length: count }, (_unused, index) => ({
    month: month(index),
    nominal: 100000 + index * 5000,
    real: 150000 - index * 1000,
  }));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

const legendList = () => screen.queryByRole("list", { name: "referencias" });

describe("RealSpendingChart en mobile", () => {
  it("muestra a lo sumo 6 meses en el eje y siempre el último", () => {
    emulateMobile();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    const { tickValues } = chart();
    expect(tickValues).not.toBeNull();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
  });

  it("angosta solo el margen izquierdo", () => {
    emulateMobile();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart().margin).toEqual({ top: 16, right: 24, bottom: 64, left: 56 });
  });

  it("cambia la leyenda de nivo por la lista de Real y Nominal", () => {
    emulateMobile();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart().legends).toBe(0);
    const items = within(legendList()!).getAllByRole("listitem");
    expect(items.map((itemElement) => itemElement.textContent)).toEqual(["Real", "Nominal"]);
  });

  it("muestra Real y Nominal del mes en un tooltip por columna", () => {
    emulateMobile();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart()).toMatchObject({ enableSlices: "x", customTooltip: "yes" });
  });
});

describe("RealSpendingChart en compu", () => {
  it("usa la leyenda de nivo abajo y deja que nivo elija las etiquetas", () => {
    emulateDesktop();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart()).toMatchObject({ legends: 1, tickValues: null, margin: { top: 16, right: 24, bottom: 84, left: 64 } });
    expect(legendList()).not.toBeInTheDocument();
  });

  it("también muestra el tooltip por columna", () => {
    emulateDesktop();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart()).toMatchObject({ enableSlices: "x", customTooltip: "yes" });
  });

  it("pinta Real con la serie 4 y Nominal con la serie 0", () => {
    emulateDesktop();
    renderWithProviders(<RealSpendingChart points={points(3)} />);
    expect(chart().colors).toEqual([seriesColor("dark", 4), seriesColor("dark", 0)]);
  });
});
