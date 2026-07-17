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
      if (url.includes("/import") && init?.method === "POST") {
        return { kind: "statement", status: "imported", transactionCount: 3,
          statement: { reconciliation: { ok: true, entries: [] } } };
      }
      return [];
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLInputElement, new File(["x"], "r.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/importado: 3 movimientos/i)).toBeInTheDocument());
  });

  it("permite reemplazar cuando el resumen ya existe", async () => {
    let replaceCalled = false;
    mockFetch((url, init) => {
      if (url.includes("/import") && init?.method === "POST") {
        if (url.includes("replace=true")) {
          replaceCalled = true;
          return { kind: "statement", status: "imported", transactionCount: 5,
            statement: { reconciliation: { ok: true, entries: [] } } };
        }
        return { kind: "statement", status: "duplicate", transactionCount: 0,
          statement: { reconciliation: { ok: true, entries: [] } } };
      }
      return [];
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLInputElement, new File(["x"], "r.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/ya estaba importado/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /reemplazar/i }));
    await waitFor(() => expect(screen.getByText(/importado: 5 movimientos/i)).toBeInTheDocument());
    expect(replaceCalled).toBe(true);
  });

  it("muestra el resultado de un cupón de crédito", async () => {
    mockFetch((url, init) => {
      if (url.includes("/import") && init?.method === "POST") {
        return { kind: "coupon", status: "imported", coupon: { cuotaNro: 7 } };
      }
      return [];
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLInputElement, new File(["x"], "c.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/cuota 7 del crédito/i)).toBeInTheDocument());
  });
});
