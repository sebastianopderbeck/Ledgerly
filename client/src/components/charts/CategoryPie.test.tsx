import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { CategoryPie } from "./CategoryPie.js";

afterEach(() => cleanup());

describe("CategoryPie", () => {
  it("muestra 'Sin datos' cuando no hay categorías", () => {
    renderWithProviders(<CategoryPie data={[]} currency="ARS" />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
  });

  it("no muestra 'Sin datos' cuando hay categorías", () => {
    renderWithProviders(<CategoryPie data={[{ category: "Compras", total: 1500, count: 1 }]} currency="ARS" />);
    expect(screen.queryByText("Sin datos")).not.toBeInTheDocument();
  });
});
