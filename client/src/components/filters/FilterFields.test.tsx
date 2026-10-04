import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import type { FilterField } from "../../filters/activeFilters.js";
import { FilterFields } from "./FilterFields.js";

const TRANSACTIONS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

const labelsIn = (container: HTMLElement) => Array.from(container.querySelectorAll("label"), (label) => label.textContent);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FilterFields", () => {
  it("renderiza los campos pedidos en el orden de la barra, con el buscador al final", () => {
    const { container } = renderWithProviders(<FilterFields fields={TRANSACTIONS} yearOptions={["2026"]} />, { route: "/transactions" });
    expect(labelsIn(container)).toEqual(["Año", "Moneda", "Tarjeta", "Mes", "Categorías", "Cuotas", "Buscar comercio"]);
  });

  it("sin el buscador deja Categorías y Cuotas", () => {
    const { container } = renderWithProviders(
      <FilterFields fields={TRANSACTIONS} yearOptions={["2026"]} withSearch={false} />,
      { route: "/transactions" },
    );
    expect(labelsIn(container)).toEqual(["Año", "Moneda", "Tarjeta", "Mes", "Categorías", "Cuotas"]);
    expect(screen.queryByRole("textbox", { name: "Buscar comercio" })).not.toBeInTheDocument();
  });

  it("solo renderiza los campos de la sección", () => {
    const { container } = renderWithProviders(<FilterFields fields={["year"]} yearOptions={["2026"]} />);
    expect(labelsIn(container)).toEqual(["Año"]);
  });
});
