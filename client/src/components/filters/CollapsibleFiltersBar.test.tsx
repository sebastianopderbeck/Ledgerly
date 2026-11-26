import { describe, it, expect, afterEach } from "vitest";
import type { ReactNode } from "react";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { CollapsibleFiltersBar } from "./CollapsibleFiltersBar.js";

const renderBar = (search?: ReactNode, count = 2) => renderWithProviders(
  <CollapsibleFiltersBar search={search} count={count} summary="2025 · USD">
    <input aria-label="Moneda" />
  </CollapsibleFiltersBar>,
);

const filtersButton = () => screen.getByRole("button", { name: /^Filtros/ });

afterEach(cleanup);

describe("CollapsibleFiltersBar", () => {
  it("muestra la búsqueda, el botón con el contador y el resumen, con los filtros escondidos", () => {
    renderBar(<input aria-label="Buscar comercio" />);
    expect(screen.getByRole("textbox", { name: "Buscar comercio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtros, 2 activos" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("2025 · USD")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Moneda" })).not.toBeInTheDocument();
  });

  it("la búsqueda va antes del botón", () => {
    renderBar(<input aria-label="Buscar comercio" />);
    const search = screen.getByRole("textbox", { name: "Buscar comercio" });
    expect(search.compareDocumentPosition(filtersButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tocar Filtros despliega el resto y volver a tocarlo lo esconde", async () => {
    renderBar();
    await userEvent.click(filtersButton());
    expect(filtersButton()).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("group", { name: "Más filtros" })).getByRole("textbox", { name: "Moneda" })).toBeInTheDocument();
    await userEvent.click(filtersButton());
    await waitFor(() => expect(screen.queryByRole("group", { name: "Más filtros" })).not.toBeInTheDocument());
  });

  it("sin filtros activos el botón se llama solo Filtros", () => {
    renderBar(undefined, 0);
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
  });
});
