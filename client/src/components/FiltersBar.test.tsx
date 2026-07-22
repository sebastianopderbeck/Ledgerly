import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { FiltersBar } from "./FiltersBar.js";

const statements = [
  { id: "1", cardLabel: "ICBC" },
  { id: "2", cardLabel: "Visa Signature ****8883" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/transactions/categories") ? ["Compras", "Transporte", "Sin categoría"]
      : url.includes("/statements") ? statements
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("FiltersBar", () => {
  it("ofrece un filtro de tarjeta con las tarjetas importadas", async () => {
    renderWithProviders(<FiltersBar />);
    const select = await screen.findByRole("combobox", { name: /tarjeta/i });
    await userEvent.click(select);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("ICBC")).toBeInTheDocument();
    expect(within(listbox).getByText("Visa Signature ****8883")).toBeInTheDocument();
  });

  it("permite filtrar por varias categorías", async () => {
    renderWithProviders(<FiltersBar showCategory />, { route: "/transactions" });
    const select = await screen.findByRole("combobox", { name: /categorías/i });
    await userEvent.click(select);
    const listbox = await screen.findByRole("listbox");
    await userEvent.click(within(listbox).getByRole("option", { name: "Compras" }));
    await userEvent.click(within(listbox).getByRole("option", { name: "Transporte" }));
    expect(within(listbox).getByRole("option", { name: "Compras" })).toHaveAttribute("aria-selected", "true");
    expect(within(listbox).getByRole("option", { name: "Transporte" })).toHaveAttribute("aria-selected", "true");
  });

  it("ofrece un filtro de cuotas con opciones todas/solo/sin", async () => {
    renderWithProviders(<FiltersBar showCategory />, { route: "/transactions" });
    const select = await screen.findByRole("combobox", { name: /cuotas/i });
    await userEvent.click(select);
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "Solo cuotas" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Sin cuotas" })).toBeInTheDocument();
  });
});
