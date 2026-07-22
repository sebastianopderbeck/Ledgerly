import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RulesPage } from "./RulesPage.js";

const rule = { id: "r1", priority: 10, matchType: "contains", pattern: "UBER", category: "Transporte", source: "user", enabled: true };
const calls: { url: string; method?: string; body?: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, body: init?.body as string });
    const isRead = url.includes("/category-rules") && (!init || !init.method || init.method === "GET");
    return new Response(JSON.stringify(isRead ? [rule] : {}), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("RulesPage", () => {
  it("lista las reglas existentes", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await waitFor(() => expect(screen.getByText("UBER")).toBeInTheDocument());
    expect(screen.getByText("Transporte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reaplicar/i })).toBeInTheDocument();
  });

  it("edita una regla y dispara PATCH con los valores nuevos", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await waitFor(() => expect(screen.getByText("UBER")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("editar"));
    fireEvent.change(screen.getByDisplayValue("Transporte"), { target: { value: "Viajes" } });
    fireEvent.click(screen.getByLabelText("guardar"));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH" && c.url.includes("/category-rules/r1"));
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch!.body!)).toMatchObject({ category: "Viajes", pattern: "UBER", matchType: "contains", priority: 10 });
    });
  });
});
