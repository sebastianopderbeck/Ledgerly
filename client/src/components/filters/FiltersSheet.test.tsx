import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import type { FilterField } from "../../filters/activeFilters.js";
import { FiltersSheet } from "./FiltersSheet.js";

const DASHBOARD: FilterField[] = ["year", "currency", "card", "month"];
const TRANSACTIONS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

const noop = () => undefined;

const LocationProbe = () => {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
};

const renderSheet = (fields: FilterField[], onClose: () => void = noop, route = "/") =>
  renderWithProviders(
    <>
      <FiltersSheet open onClose={onClose} fields={fields} yearOptions={["2025", "2026"]} />
      <LocationProbe />
    </>,
    { route },
  );

const sheet = () => screen.getByRole("dialog", { name: "Filtros" });

const currentParams = () => new URLSearchParams(screen.getByTestId("search").textContent ?? "");

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/transactions/categories") ? ["Compras", "Transporte"]
      : url.includes("/statements") ? [{ id: "1", cardLabel: "ICBC" }]
      : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FiltersSheet", () => {
  it("es una hoja titulada Filtros con los campos de la sección", () => {
    renderSheet(DASHBOARD);
    for (const name of [/año/i, /moneda/i, /tarjeta/i, /^mes/i]) {
      expect(within(sheet()).getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(within(sheet()).queryByRole("combobox", { name: /categorías/i })).not.toBeInTheDocument();
  });

  it("en Movimientos lleva Categorías y Cuotas pero ningún campo de texto, así el teclado no tapa «Listo»", () => {
    renderSheet(TRANSACTIONS, noop, "/transactions");
    expect(within(sheet()).getByRole("combobox", { name: /categorías/i })).toBeInTheDocument();
    expect(within(sheet()).getByRole("combobox", { name: /cuotas/i })).toBeInTheDocument();
    expect(within(sheet()).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(sheet()).getByRole("button", { name: "Listo" })).toBeInTheDocument();
  });

  it("elegir una opción escribe en la URL al momento y no cierra la hoja", async () => {
    const onClose = vi.fn();
    renderSheet(DASHBOARD, onClose);
    await userEvent.click(within(sheet()).getByRole("combobox", { name: /moneda/i }));
    await userEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "USD" }));
    expect(currentParams().get("currency")).toBe("USD");
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "Filtros" })).toBeInTheDocument();
  });

  it("«Listo» pide cerrar la hoja", async () => {
    const onClose = vi.fn();
    renderSheet(DASHBOARD, onClose);
    await userEvent.click(within(sheet()).getByRole("button", { name: "Listo" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
