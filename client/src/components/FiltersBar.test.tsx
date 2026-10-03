import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { FiltersBar, type FilterField } from "./FiltersBar.js";

const statements = [
  { id: "1", cardLabel: "ICBC" },
  { id: "2", cardLabel: "Visa Signature ****8883" },
];
const monthly = [
  { month: "2025-11", total: 1, count: 1 },
  { month: "2026-01", total: 1, count: 1 },
  { month: "2026-02", total: 1, count: 1 },
];

const LocationProbe = () => {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
};

const renderBar = (fields: FilterField[], route = "/", yearOptions = ["2025", "2026"]) =>
  renderWithProviders(
    <>
      <FiltersBar fields={fields} yearOptions={yearOptions} />
      <LocationProbe />
    </>,
    { route },
  );

const currentParams = () => new URLSearchParams(screen.getByTestId("search").textContent ?? "");

const openSelect = async (name: RegExp) => {
  await userEvent.click(await screen.findByRole("combobox", { name }));
  return screen.findByRole("listbox");
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/transactions/categories") ? ["Compras", "Transporte", "Sin categoría"]
      : url.includes("/statements") ? statements
      : url.includes("/stats/monthly") ? monthly
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FiltersBar", () => {
  it("muestra solo los campos pedidos", async () => {
    renderBar(["year"]);
    expect(await screen.findByRole("combobox", { name: /año/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /moneda/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /tarjeta/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /^mes/i })).not.toBeInTheDocument();
  });

  it("ofrece un filtro de tarjeta con las tarjetas importadas", async () => {
    renderBar(["currency", "card"]);
    const listbox = await openSelect(/tarjeta/i);
    expect(await within(listbox).findByText("ICBC")).toBeInTheDocument();
    expect(within(listbox).getByText("Visa Signature ****8883")).toBeInTheDocument();
  });

  it("permite filtrar por varias categorías", async () => {
    renderBar(["transaction"], "/transactions");
    const listbox = await openSelect(/categorías/i);
    await userEvent.click(await within(listbox).findByRole("option", { name: "Compras" }));
    await userEvent.click(within(listbox).getByRole("option", { name: "Transporte" }));
    expect(currentParams().getAll("category")).toEqual(["Compras", "Transporte"]);
  });

  it("ofrece un filtro de cuotas con opciones todas/solo/sin", async () => {
    renderBar(["transaction"], "/transactions");
    const listbox = await openSelect(/cuotas/i);
    expect(within(listbox).getByRole("option", { name: "Solo cuotas" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Sin cuotas" })).toBeInTheDocument();
  });

  it("elegir un segundo año escribe params repetidos", async () => {
    renderBar(["year"], "/?year=2026");
    const listbox = await openSelect(/año/i);
    await userEvent.click(within(listbox).getByRole("option", { name: "2025" }));
    expect(currentParams().getAll("year")).toEqual(["2025", "2026"]);
  });

  it("elegir Todos pone year=all", async () => {
    renderBar(["year"], "/?year=2026");
    const listbox = await openSelect(/año/i);
    await userEvent.click(within(listbox).getByRole("option", { name: "Todos" }));
    expect(currentParams().getAll("year")).toEqual(["all"]);
  });

  it("destildar el último año vuelve a Todos", async () => {
    renderBar(["year"], "/?year=2026");
    const listbox = await openSelect(/año/i);
    await userEvent.click(within(listbox).getByRole("option", { name: "2026" }));
    expect(currentParams().getAll("year")).toEqual(["all"]);
  });

  it("ofrece el año actual y los elegidos aunque no tengan datos", async () => {
    renderBar(["year"], "/?year=2019", ["2025"]);
    const listbox = await openSelect(/año/i);
    const names = within(listbox).getAllByRole("option").map((option) => option.textContent);
    expect(names).toEqual(["Todos", "2026", "2025", "2019"]);
  });

  it("el Mes lista solo meses de los años elegidos", async () => {
    renderBar(["year", "month"], "/?year=2026");
    const listbox = await openSelect(/^mes/i);
    expect(await within(listbox).findByRole("option", { name: /febrero/i })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: /enero/i })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: /noviembre/i })).not.toBeInTheDocument();
  });

  it("sacar el año del Mes elegido limpia el Mes", async () => {
    renderBar(["year", "month"], "/?year=2025&year=2026&from=2025-11-01&to=2025-11-30");
    const listbox = await openSelect(/año/i);
    await userEvent.click(within(listbox).getByRole("option", { name: "2025" }));
    expect(currentParams().getAll("year")).toEqual(["2026"]);
    expect(currentParams().get("from")).toBeNull();
  });

  it("en compu muestra los campos en línea, en el orden de siempre", () => {
    const { container } = renderBar(["year", "currency", "card", "month", "transaction"], "/transactions");
    const labels = Array.from(container.querySelectorAll("label"), (label) => label.textContent);
    expect(labels).toEqual(["Año", "Moneda", "Tarjeta", "Mes", "Categorías", "Cuotas", "Buscar comercio"]);
  });
});
