import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ChartLegend, LegendSwatch } from "./ChartLegend.js";

afterEach(cleanup);

describe("ChartLegend", () => {
  it("lista cada referencia con su etiqueta y su valor", () => {
    render(
      <ChartLegend
        items={[
          { id: "Compras", label: "Compras", color: "#22d3ee", value: "$ 1.500" },
          { id: "Servicios", label: "Servicios", color: "#818cf8" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "referencias" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Compras");
    expect(items[0]).toHaveTextContent("$ 1.500");
    expect(items[1]).toHaveTextContent("Servicios");
  });

  it("pinta el punto de cada referencia con su color", () => {
    render(<ChartLegend items={[{ id: "Neto", label: "Neto", color: "#34d399" }]} />);
    const swatch = within(screen.getByRole("listitem")).getByTestId("legend-swatch");
    expect(swatch).toHaveStyle({ backgroundColor: "#34d399", borderRadius: "50%" });
  });
});

describe("LegendSwatch", () => {
  it("por defecto es el cuadradito de los tooltips", () => {
    render(<LegendSwatch color="#f472b6" />);
    expect(screen.getByTestId("legend-swatch")).toHaveStyle({ width: "12px", height: "12px", borderRadius: "2px", backgroundColor: "#f472b6" });
  });
});
