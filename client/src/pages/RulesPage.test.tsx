import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RulesPage } from "./RulesPage.js";

const rule = { id: "1", priority: 10, matchType: "regex", pattern: "NETFLIX", category: "Suscripciones", source: "system", enabled: true };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(url.includes("/category-rules") ? [rule] : {}), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.restoreAllMocks());

describe("RulesPage", () => {
  it("lista las reglas existentes", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await waitFor(() => expect(screen.getByText("NETFLIX")).toBeInTheDocument());
    expect(screen.getByText("Suscripciones")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reaplicar/i })).toBeInTheDocument();
  });
});
