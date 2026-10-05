import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { importResultUnionSchema, mailSourceStatusDtoSchema, statementReviewDtoSchema } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { ImportPage } from "./ImportPage.js";

const MAIL_DISABLED = [
  { source: "icloud", enabled: false, missing: ["ICLOUD_USER"], scope: null, schedule: null, lastRun: null },
  {
    source: "gmail", enabled: false, missing: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
    scope: null, schedule: null, lastRun: null,
  },
];

const statementDto = (id: string, transactionCount = 3) => ({
  id, issuer: "visa_signature", cardLabel: "Visa Signature ****1234", last4: "1234",
  closingDate: "2026-09-25", dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 3000, usd: 0 },
    saldoActual: { ars: 3000, usd: 0 },
    pagoMinimo: { ars: 300, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "r.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
  transactionCount, uploadedAt: "2026-09-26T12:00:00.000Z",
});

const statementResult = (status: "imported" | "duplicate", transactionCount: number, id = "s-nuevo") => ({
  kind: "statement", status, transactionCount, statement: statementDto(id, transactionCount),
});

const reviewOf = (id: string) => ({
  statement: statementDto(id),
  previousStatements: 0,
  historyStatements: 0,
  skippedChecks: ["usd", "nuevo", "categoria"],
  findings: [{
    kind: "transaction", key: "tx:t1", reasons: ["sin-categoria"], duplicateOf: null, usualUsd: null,
    transaction: {
      id: "t1", statementId: id, issuer: "visa_signature", cardLabel: "Visa Signature ****1234", date: "2026-09-12",
      descriptionRaw: "COMERCIO UNO", merchant: "COMERCIO UNO", category: "Sin categoría", categorySource: "rule",
      amount: 2500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
      installmentCurrent: null, installmentTotal: null, comprobante: null,
    },
  }],
  reviewedKeys: [],
});

const REVIEW_URL = /\/statements\/([^/?]+)\/review/;

const sharedDefaults = (url: string, init?: RequestInit): unknown => {
  if ((init?.method ?? "GET") !== "GET") return undefined;
  if (url.includes("/mail/status")) return MAIL_DISABLED;
  const review = REVIEW_URL.exec(url);
  if (review) return reviewOf(review[1]);
  if (url.endsWith("/statements")) return [];
  return undefined;
};

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = sharedDefaults(url, init) ?? handler(url, init);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
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

  it("los datos de prueba compartidos cumplen los contratos de la API", () => {
    expect(() => mailSourceStatusDtoSchema.array().parse(MAIL_DISABLED)).not.toThrow();
    expect(() => statementReviewDtoSchema.parse(reviewOf("s-nuevo"))).not.toThrow();
    expect(() => importResultUnionSchema.parse(statementResult("imported", 3))).not.toThrow();
  });

  it("la sección Mails va después del resultado de la subida y antes de «Archivos importados»", () => {
    renderWithProviders(<ImportPage />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toContain("Mails");
    expect(headings.indexOf("Mails")).toBeLessThan(headings.indexOf("Archivos importados"));
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
        return statementResult("imported", 3);
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
          return statementResult("imported", 5);
        }
        return statementResult("duplicate", 0);
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
        return statementResult("imported", 3);
      }
      return url.includes("/imports") ? imported : {};
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "visa-agosto.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/importado: 3 movimientos/i)).toBeInTheDocument());
  });
});
