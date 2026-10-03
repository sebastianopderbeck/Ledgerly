import { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { CategoryStat } from "@ledgerly/shared";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import { formatMoney } from "../../format.js";
import type { RaceSerie } from "../../macroSignals.js";
import { CategoryPie } from "./CategoryPie.js";
import { MacroRaceChart } from "./MacroRaceChart.js";
import { AutoProgressDonutChart } from "./AutoProgressDonutChart.js";

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

const cssColor = (color: string) => {
  const element = document.createElement("span");
  element.style.backgroundColor = color;
  return element.style.backgroundColor;
};

interface PieWithFilterProps {
  first: CategoryStat[];
  next: CategoryStat[];
}

const PieWithFilter = ({ first, next }: PieWithFilterProps) => {
  const [data, setData] = useState(first);
  return (
    <>
      <button type="button" onClick={() => setData(next)}>cambiar filtro</button>
      <CategoryPie data={data} currency="ARS" />
    </>
  );
};

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

  it("en mobile la leyenda usa los mismos colores que las porciones aunque cambien los datos", () => {
    emulateMobile();
    renderWithProviders(
      <PieWithFilter
        first={categories}
        next={[
          { category: "Servicios", total: 900, count: 2 },
          { category: "Farmacia", total: 700, count: 1 },
          { category: "Compras", total: 300, count: 1 },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "cambiar filtro" }));
    const swatchColors = within(legendList()!).getAllByTestId("legend-swatch").map((swatch) => swatch.style.backgroundColor);
    const sliceColors = (chart().colors ?? []).map((color) => cssColor(String(color)));
    expect(swatchColors).toHaveLength(3);
    expect(sliceColors).toHaveLength(3);
    expect(sliceColors).toEqual(swatchColors);
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
    expect(margin).toEqual({ top: 16, right: 24, bottom: 64, left: 56 });
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
  });

  it("en mobile toma los meses de todas las series, no solo de la primera", () => {
    emulateMobile();
    const [first, ...rest] = race;
    renderWithProviders(<MacroRaceChart series={[{ ...first, data: first.data.slice(0, 10) }, ...rest]} />);
    const { tickValues } = chart();
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

describe("avance del plan del auto", () => {
  it("en mobile dice 1 cuota en singular y el resto en plural", async () => {
    const summary = {
      grupo: "3684", orden: "97", plan: "K", modelo: "C3 AIRCROSS", cuotasPagadas: 1, cuotasTotales: 120,
      porcentajeAvance: 0.0083, totalPagado: 268551.23, valorActualAuto: 41580000, totalPagadoUsd: 268.55,
      ultimaCuota: 1, fechaUltimoVencimiento: "2026-07-10",
    };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify(summary), { status: 200, headers: { "Content-Type": "application/json" } })));
    emulateMobile();
    renderWithProviders(<AutoProgressDonutChart />);
    const items = within(await screen.findByRole("list", { name: "referencias" })).getAllByRole("listitem");
    expect(within(items[0]).getByText("1 cuota")).toBeInTheDocument();
    expect(within(items[1]).getByText("119 cuotas")).toBeInTheDocument();
  });
});
