import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import { formatMoney } from "../../format.js";
import type { RaceSerie } from "../../macroSignals.js";
import { CategoryPie } from "./CategoryPie.js";
import { MacroRaceChart } from "./MacroRaceChart.js";

vi.mock("@nivo/pie", async () => ({ ResponsivePie: (await import("../../testing/nivoProbe.js")).NivoProbe }));
vi.mock("@nivo/line", async () => ({ ResponsiveLine: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const categories = [
  { category: "Compras", total: 1500, count: 3 },
  { category: "Servicios", total: 800, count: 2 },
];

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const race: RaceSerie[] = ["Dólar", "UVA", "Plazo fijo"].map((id, slot) => ({
  id,
  data: Array.from({ length: 14 }, (_unused, index) => ({ x: periodo(index), y: 100 + index * (slot + 1) })),
}));

const legendList = () => screen.queryByRole("list", { name: "referencias" });

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

describe("torta de categorías", () => {
  it("en mobile lista las categorías con su monto debajo y no usa la leyenda de nivo", () => {
    emulateMobile();
    renderWithProviders(<CategoryPie data={categories} currency="ARS" />);
    const items = within(legendList()!).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Compras");
    expect(items[0]).toHaveTextContent(formatMoney(1500, "ARS").replace(/\s/g, " "));
    expect(chart()).toMatchObject({ legends: 0, margin: { top: 16, right: 16, bottom: 16, left: 16 } });
  });

  it("en compu deja la leyenda de nivo a la derecha", () => {
    emulateDesktop();
    renderWithProviders(<CategoryPie data={categories} currency="ARS" />);
    expect(legendList()).not.toBeInTheDocument();
    expect(chart()).toMatchObject({ legends: 1, margin: { top: 16, right: 150, bottom: 16, left: 16 } });
  });

  it("sin datos en mobile dice Sin datos y no dibuja una leyenda vacía", () => {
    emulateMobile();
    renderWithProviders(<CategoryPie data={[]} currency="ARS" />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(legendList()).not.toBeInTheDocument();
  });

  it("si la pantalla pasa a tamaño compu, la leyenda vuelve a nivo sin duplicarse", () => {
    emulateMobile();
    renderWithProviders(<CategoryPie data={categories} currency="ARS" />);
    expect(legendList()).toBeInTheDocument();
    emulateDesktop();
    expect(legendList()).not.toBeInTheDocument();
    expect(chart().legends).toBe(1);
  });
});

describe("carrera de indicadores", () => {
  it("en mobile lista las series debajo, ralea los meses y recupera el margen de la leyenda", () => {
    emulateMobile();
    renderWithProviders(<MacroRaceChart series={race} />);
    const items = within(legendList()!).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["Dólar", "UVA", "Plazo fijo"]);
    const { legends, margin, tickValues } = chart();
    expect(legends).toBe(0);
    expect(margin).toEqual({ top: 16, right: 24, bottom: 64, left: 48 });
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
  });

  it("en compu queda como siempre", () => {
    emulateDesktop();
    renderWithProviders(<MacroRaceChart series={race} />);
    expect(legendList()).not.toBeInTheDocument();
    expect(chart()).toMatchObject({ legends: 1, tickValues: null, margin: { top: 16, right: 24, bottom: 84, left: 56 } });
  });
});
