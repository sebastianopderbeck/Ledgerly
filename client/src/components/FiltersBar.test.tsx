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
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(url.includes("/statements") ? statements : {}), {
      status: 200, headers: { "Content-Type": "application/json" },
    })));
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
});
