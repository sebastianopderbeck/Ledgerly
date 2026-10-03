import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import type { DolarReal, TasaRealPoint } from "../../macroSignals.js";
import { DolarRealChart } from "./DolarRealChart.js";
import { TasaRealChart } from "./TasaRealChart.js";

vi.mock("@nivo/line", async () => ({ ResponsiveLine: (await import("../../testing/nivoProbe.js")).NivoProbe }));
vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const dolarReal = (meses: number): DolarReal => ({
  serie: Array.from({ length: meses }, (_unused, index) => ({ periodo: periodo(index), indice: 100 + index })),
  mediana: 100,
  indiceHoy: null,
  ultimoPeriodoConIpc: null,
});

const tasaReal = (meses: number): TasaRealPoint[] =>
  Array.from({ length: meses }, (_unused, index) => ({ periodo: periodo(index), tasaReal: index % 2 === 0 ? 1.5 : -0.5 }));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

describe("series por mes en mobile", () => {
  it("con muchos meses muestra a lo sumo 6 etiquetas y siempre el último mes", () => {
    emulateMobile();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(14)} />);
    const { tickValues } = chart();
    expect(tickValues).not.toBeNull();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
  });

  it("con pocos meses muestra todos", () => {
    emulateMobile();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(3)} />);
    expect(chart().tickValues).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("angosta solo el margen izquierdo", () => {
    emulateMobile();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(14)} />);
    expect(chart().margin).toEqual({ top: 16, right: 24, bottom: 64, left: 56 });
  });

  it("la línea muestra el mes y el valor en un tooltip compacto por columna", () => {
    emulateMobile();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(14)} />);
    expect(chart()).toMatchObject({ enableSlices: "x", customTooltip: "yes" });
  });

  it("las barras usan el tooltip compacto", () => {
    emulateMobile();
    renderWithProviders(<TasaRealChart points={tasaReal(14)} />);
    expect(chart().customTooltip).toBe("yes");
  });

  it("también ralea las barras", () => {
    emulateMobile();
    renderWithProviders(<TasaRealChart points={tasaReal(14)} />);
    const { tickValues, margin } = chart();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
    expect(margin).toEqual({ top: 16, right: 24, bottom: 64, left: 56 });
  });
});

describe("series por mes en compu", () => {
  it("deja que nivo elija las etiquetas y mantiene el margen de siempre", () => {
    emulateDesktop();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(14)} />);
    expect(chart()).toMatchObject({ tickValues: null, margin: { top: 16, right: 24, bottom: 64, left: 56 } });
  });

  it("la línea mantiene el tooltip de nivo sin columnas", () => {
    emulateDesktop();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(14)} />);
    expect(chart()).toMatchObject({ enableSlices: "", customTooltip: "no" });
  });

  it("las barras también quedan como siempre", () => {
    emulateDesktop();
    renderWithProviders(<TasaRealChart points={tasaReal(14)} />);
    expect(chart()).toMatchObject({ tickValues: null, customTooltip: "no", margin: { top: 16, right: 24, bottom: 64, left: 56 } });
  });
});
