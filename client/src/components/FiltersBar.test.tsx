import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
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
  vi.unstubAllGlobals();
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

  it("en compu sigue mostrando los campos en línea, sin botón Filtros", () => {
    emulateDesktop();
    renderBar(["year", "currency"]);
    expect(screen.getByRole("combobox", { name: /año/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^filtros/i })).not.toBeInTheDocument();
  });
});

const DASHBOARD: FilterField[] = ["year", "currency", "card", "month"];
const TRANSACTIONS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

const filtersButton = (name: string) => screen.getByRole("button", { name });

const filtersSheet = () => screen.queryByRole("dialog", { name: "Filtros" });

const chooseInSheet = async (field: RegExp, option: string) => {
  const sheet = await screen.findByRole("dialog", { name: "Filtros" });
  await userEvent.click(within(sheet).getByRole("combobox", { name: field }));
  await userEvent.click(await within(await screen.findByRole("listbox")).findByRole("option", { name: option }));
};

describe("FiltersBar en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra el botón Filtros con el contador y el resumen, no los campos", () => {
    renderBar(DASHBOARD, "/?year=2025&currency=USD&cardLabel=ICBC");
    expect(filtersButton("Filtros, 3 activos")).toBeInTheDocument();
    expect(screen.getByText("2025 · USD · ICBC")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /año/i })).not.toBeInTheDocument();
  });

  it("con todo en su default el botón no lleva contador", () => {
    renderBar(DASHBOARD, "/?year=2026&currency=ARS");
    expect(filtersButton("Filtros")).toBeInTheDocument();
    expect(screen.getByText("2026 · ARS")).toBeInTheDocument();
  });

  it("el contador y el resumen solo miran los campos de la sección", () => {
    renderBar(["year"], "/credits?year=2025&currency=USD&cardLabel=ICBC");
    expect(filtersButton("Filtros, 1 activo")).toBeInTheDocument();
    expect(screen.getByText("2025")).toBeInTheDocument();
  });

  it("con muchas categorías el resumen las cuenta y queda en una sola línea", () => {
    renderBar(TRANSACTIONS, "/transactions?category=Compras&category=Salud&category=Transporte");
    expect(filtersButton("Filtros, 1 activo")).toBeInTheDocument();
    expect(screen.getByText("2026 · ARS · 3 categorías")).toHaveClass("MuiTypography-noWrap");
  });

  it("tocar Filtros abre la hoja con los campos de la sección", async () => {
    renderBar(DASHBOARD);
    const button = filtersButton("Filtros");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    const sheet = screen.getByRole("dialog", { name: "Filtros" });
    for (const name of [/año/i, /moneda/i, /tarjeta/i, /^mes/i]) {
      expect(within(sheet).getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("los cambios se escriben en la URL con la hoja abierta y «Listo» la cierra con el contador al día", async () => {
    renderBar(DASHBOARD);
    await userEvent.click(filtersButton("Filtros"));
    await chooseInSheet(/moneda/i, "USD");
    expect(currentParams().get("currency")).toBe("USD");
    await chooseInSheet(/tarjeta/i, "ICBC");
    expect(currentParams().get("cardLabel")).toBe("ICBC");
    const sheet = await screen.findByRole("dialog", { name: "Filtros" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(filtersSheet()).not.toBeInTheDocument());
    expect(filtersButton("Filtros, 2 activos")).toBeInTheDocument();
    expect(screen.getByText("2026 · USD · ICBC")).toBeInTheDocument();
  });

  it("con la hoja abierta, la navegación inferior queda tapada y «Listo» está en la hoja", async () => {
    renderWithProviders(
      <>
        <FiltersBar fields={["year"]} yearOptions={["2025", "2026"]} />
        <nav aria-label="principal" />
      </>,
    );
    expect(screen.getByRole("navigation", { name: "principal" })).toBeInTheDocument();
    await userEvent.click(filtersButton("Filtros"));
    expect(screen.queryByRole("navigation", { name: "principal" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Filtros" })).getByRole("button", { name: "Listo" })).toBeInTheDocument();
  });

  it("en Movimientos el buscador queda a la vista debajo del botón y fuera de la hoja", async () => {
    renderBar(TRANSACTIONS, "/transactions");
    const button = filtersButton("Filtros");
    const search = screen.getByRole("textbox", { name: "Buscar comercio" });
    expect(button.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await userEvent.click(button);
    const sheet = screen.getByRole("dialog", { name: "Filtros" });
    expect(within(sheet).getByRole("combobox", { name: /categorías/i })).toBeInTheDocument();
    expect(within(sheet).queryByRole("textbox", { name: "Buscar comercio" })).not.toBeInTheDocument();
  });

  it("escribir en el buscador mantiene el foco, filtra al momento y suma al contador sin repetirse en el resumen", async () => {
    renderBar(TRANSACTIONS, "/transactions");
    const search = screen.getByRole("textbox", { name: "Buscar comercio" });
    await userEvent.type(search, "uber");
    expect(search).toHaveValue("uber");
    expect(search).toHaveFocus();
    expect(currentParams().get("search")).toBe("uber");
    expect(filtersButton("Filtros, 1 activo")).toBeInTheDocument();
    expect(screen.getByText("2026 · ARS")).toBeInTheDocument();
  });

  it("si la pantalla pasa a tamaño compu con la hoja abierta, quedan los campos en línea y nada tapando", async () => {
    renderBar(DASHBOARD);
    await userEvent.click(filtersButton("Filtros"));
    emulateDesktop();
    await waitFor(() => expect(filtersSheet()).not.toBeInTheDocument());
    expect(document.querySelector(".MuiBackdrop-root")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(screen.getByRole("combobox", { name: /año/i })).toBeInTheDocument();
  });
});
