import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { ImportPage } from "./ImportPage.js";

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) =>
    new Response(JSON.stringify(handler(url, init)), { status: 200, headers: { "Content-Type": "application/json" } })));
}

beforeEach(() => {
  mockFetch((url) => (url.includes("/statements") ? [] : {}));
});
afterEach(() => vi.restoreAllMocks());

describe("ImportPage", () => {
  it("muestra el dropzone y el título", async () => {
    renderWithProviders(<ImportPage />);
    expect(screen.getByText(/importar resumen/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /elegir archivo/i })).toBeInTheDocument();
  });

  it("sube un archivo y muestra el resultado", async () => {
    mockFetch((url, init) => {
      if (url.includes("/statements") && init?.method === "POST") {
        return { status: "imported", transactionCount: 3,
          statement: { reconciliation: { ok: true, entries: [] } } };
      }
      return [];
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLInputElement, new File(["x"], "r.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/importado: 3 movimientos/i)).toBeInTheDocument());
  });
});
