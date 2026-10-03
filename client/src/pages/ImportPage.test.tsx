import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { ImportPage } from "./ImportPage.js";

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) =>
    new Response(JSON.stringify(handler(url, init)), { status: 200, headers: { "Content-Type": "application/json" } })));
}

beforeEach(() => {
  mockFetch((url) => (url.includes("/imports") ? [] : {}));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ImportPage", () => {
  it("muestra el dropzone y el título", async () => {
    renderWithProviders(<ImportPage />);
    expect(screen.getByText(/importar resumen/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /elegir archivo/i })).toBeInTheDocument();
  });

  it("lista los archivos importados de todos los tipos", async () => {
    mockFetch((url) => (url.includes("/imports")
      ? [
        { id: "s1", kind: "statement", fileName: "visa-julio.pdf", uploadedAt: "2026-07-05T12:00:00.000Z",
          documentDate: "2026-07-02", description: "Visa ****1234 · 3 movimientos", needsReview: false },
        { id: "p1", kind: "payslip", fileName: "recibo-junio.pdf", uploadedAt: "2026-07-04T12:00:00.000Z",
          documentDate: "2026-06-30", description: "Período 2026-06", needsReview: false },
      ]
      : {}));
    renderWithProviders(<ImportPage />);
    expect(screen.getByRole("heading", { name: "Archivos importados" })).toBeInTheDocument();
    expect(await screen.findByText("visa-julio.pdf")).toBeInTheDocument();
    expect(screen.getByText("recibo-junio.pdf")).toBeInTheDocument();
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

  it("muestra el resultado de un recibo de sueldo", async () => {
    mockFetch((url, init) => {
      if (url.includes("/import") && init?.method === "POST") {
        return { kind: "payslip", status: "imported", payslip: { periodo: "2026-05", neto: 3897401 } };
      }
      return [];
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLInputElement, new File(["x"], "p.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/recibo de 2026-05/i)).toBeInTheDocument());
  });

  it("muestra el resultado de un cupón de auto", async () => {
    mockFetch((url, init) => {
      if (url.includes("/import") && init?.method === "POST") {
        return { kind: "auto", status: "imported", coupon: { cuotaNro: 12 } };
      }
      return [];
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLInputElement, new File(["x"], "a.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/cuota 12 del plan de auto/i)).toBeInTheDocument());
  });
});

describe("ImportPage en mobile", () => {
  const imported = [
    { id: "s1", kind: "statement", fileName: "visa-julio.pdf", uploadedAt: "2026-07-05T12:00:00.000Z",
      documentDate: "2026-07-02", description: "Visa ****1234 · 3 movimientos", needsReview: true },
    { id: "p1", kind: "payslip", fileName: "recibo-junio.pdf", uploadedAt: "2026-07-04T12:00:00.000Z",
      documentDate: "2026-06-30", description: "Período 2026-06", needsReview: false },
  ];

  beforeEach(() => {
    emulateMobile();
    mockFetch((url) => (url.includes("/imports") ? imported : {}));
  });

  it("ofrece «Elegir PDF» y lista los archivos importados como tarjetas, sin grilla", async () => {
    renderWithProviders(<ImportPage />);
    expect(screen.getByRole("button", { name: "Elegir PDF" })).toBeInTheDocument();
    expect(screen.queryByText(/arrastrá el pdf/i)).not.toBeInTheDocument();
    const visa = await screen.findByRole("article", { name: "visa-julio.pdf" });
    expect(within(visa).getByText("Tarjeta")).toBeInTheDocument();
    expect(within(visa).getByText("revisar")).toBeInTheDocument();
    expect(within(visa).getByText("Visa ****1234 · 3 movimientos")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "recibo-junio.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("borrar un archivo desde su tarjeta pide confirmación y manda el DELETE", async () => {
    renderWithProviders(<ImportPage />);
    await userEvent.click(await screen.findByRole("button", { name: "borrar recibo-junio.pdf" }));
    const confirm = screen.getByRole("dialog", { name: "Borrar archivo" });
    expect(within(confirm).getByText(/¿borrar recibo-junio\.pdf\?/i)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(String(call?.[0])).toBe("/api/imports/payslip/p1");
    });
  });

  it("importa el PDF elegido y muestra el resultado", async () => {
    mockFetch((url, init) => {
      if (url.includes("/import") && init?.method === "POST") {
        return { kind: "statement", status: "imported", transactionCount: 3,
          statement: { reconciliation: { ok: true, entries: [] } } };
      }
      return url.includes("/imports") ? imported : {};
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "visa-agosto.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/importado: 3 movimientos/i)).toBeInTheDocument());
  });
});
