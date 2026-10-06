import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReviewFinding, StatementDTO, StatementReviewDTO, StatementReviewPatch } from "@ledgerly/shared";
import { cssFor } from "../testing/cssFor.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { StatementReviewSection } from "./StatementReviewSection.js";

const statement = (id: string, overrides: Partial<StatementDTO>): StatementDTO => ({
  id,
  issuer: "visa_signature",
  cardLabel: "Visa Signature ****1234",
  last4: "1234",
  closingDate: "2026-09-25",
  dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 100000, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: `${id}.pdf`,
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 3,
  uploadedAt: "2026-09-26T12:00:00.000Z",
  ...overrides,
});

const VISA_OLD = statement("v1", { closingDate: "2026-08-25", dueDate: "2026-09-05" });
const VISA = statement("v2", {});
const ICBC = statement("i1", { issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: "2026-09-20", dueDate: "2026-10-09" });

const uncategorized = (id: string, merchant: string, statementId: string): ReviewFinding => ({
  kind: "transaction",
  key: `tx:${id}`,
  reasons: ["sin-categoria"],
  duplicateOf: null,
  usualUsd: null,
  transaction: {
    id, statementId, issuer: "visa_signature", cardLabel: "Visa Signature ****1234", date: "2026-09-12",
    descriptionRaw: merchant, merchant, category: "Sin categoría", categorySource: "rule", amount: 2500,
    currency: "ARS", direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null,
    installmentTotal: null, comprobante: null,
  },
});

const reviewOf = (target: StatementDTO, findings: ReviewFinding[]): StatementReviewDTO => ({
  statement: target,
  previousStatements: 6,
  historyStatements: 6,
  skippedChecks: [],
  findings,
  reviewedKeys: [],
});

const REVIEWS: Record<string, StatementReviewDTO> = {
  v1: reviewOf(VISA_OLD, [uncategorized("o1", "COMERCIO VIEJO", "v1")]),
  v2: reviewOf(VISA, [
    uncategorized("t1", "COMERCIO UNO", "v2"),
    uncategorized("t2", "COMERCIO DOS", "v2"),
    uncategorized("t3", "COMERCIO TRES", "v2"),
  ]),
  i1: reviewOf(ICBC, []),
};

const REVIEW_URL = /\/statements\/([^/?]+)\/review$/;

interface FetchOptions {
  statements?: StatementDTO[];
  failingReviews?: string[];
  patchFails?: boolean;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch({ statements = [VISA_OLD, VISA, ICBC], failingReviews = [], patchFails = false }: FetchOptions = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const review = REVIEW_URL.exec(url);
    if (review && init?.method === "PATCH") {
      if (patchFails) return json({ error: "Falló el server" }, 500);
      const { keys } = JSON.parse(String(init.body)) as StatementReviewPatch;
      return json({ reviewedKeys: keys });
    }
    if (review) return failingReviews.includes(review[1]) ? json({ error: "Se cayó la base" }, 500) : json(REVIEWS[review[1]]);
    if (url.endsWith("/statements")) return json(statements);
    return json({});
  }));
}

const picker = () => screen.findByRole("group", { name: "resumen a revisar" });

beforeEach(() => {
  mockFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StatementReviewSection", () => {
  it("ofrece el último resumen de cada tarjeta, con sus pendientes, y abre el primero", async () => {
    renderWithProviders(<StatementReviewSection />);
    const group = await picker();
    const visa = within(group).getByRole("button", { name: /Visa Signature/ });
    expect(visa).toHaveAttribute("aria-pressed", "true");
    expect(within(visa).getByText("vence 2026-10-06")).toBeInTheDocument();
    expect(await within(visa).findByText("3")).toBeInTheDocument();
    const icbc = within(group).getByRole("button", { name: /ICBC/ });
    expect(within(icbc).getByText("vence 2026-10-09")).toBeInTheDocument();
    expect(await within(icbc).findByTitle("revisado")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Revisión antes de pagar" })).toBeInTheDocument();
    expect(await screen.findByText("COMERCIO UNO")).toBeInTheDocument();
  });

  it("cambiar de tarjeta muestra la otra revisión", async () => {
    renderWithProviders(<StatementReviewSection />);
    await screen.findByText("COMERCIO UNO");
    await userEvent.click(screen.getByRole("button", { name: /ICBC/ }));
    expect(await screen.findByText("No encontramos nada raro en este resumen.")).toBeInTheDocument();
    expect(screen.queryByText("COMERCIO UNO")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ICBC/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("con un resumen viejo recién subido, lo ofrece primero y lo deja elegido", async () => {
    renderWithProviders(<StatementReviewSection focusStatement={VISA_OLD} />);
    const buttons = within(await picker()).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(within(buttons[0]).getByText("recién importado · cierre 2026-08-25")).toBeInTheDocument();
    expect(await screen.findByText("COMERCIO VIEJO")).toBeInTheDocument();
  });

  it("tildar manda el PATCH, deja el hallazgo tildado y baja los pendientes", async () => {
    renderWithProviders(<StatementReviewSection />);
    await userEvent.click(await screen.findByText("COMERCIO UNO"));
    await waitFor(() => {
      const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(String(patch?.[0])).toBe("/api/statements/v2/review");
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ keys: ["tx:t1"], reviewed: true });
    });
    expect(screen.getByRole("checkbox", { name: "revisado: COMERCIO UNO" })).toBeChecked();
    expect(within(screen.getByRole("button", { name: /Visa Signature/ })).getByText("2")).toBeInTheDocument();
  });

  it("si no se puede guardar, avisa y el tilde vuelve al estado del server", async () => {
    mockFetch({ patchFails: true });
    renderWithProviders(<StatementReviewSection />);
    await userEvent.click(await screen.findByText("COMERCIO UNO"));
    expect(await screen.findByText("No se pudo guardar la revisión: Falló el server")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "revisado: COMERCIO UNO" })).not.toBeChecked());
  });

  it("si falla la revisión de una tarjeta, el título y el selector siguen", async () => {
    mockFetch({ failingReviews: ["v2"] });
    renderWithProviders(<StatementReviewSection />);
    expect(await screen.findByText("No se pudo cargar la revisión: Se cayó la base")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Revisión antes de pagar" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "resumen a revisar" })).toBeInTheDocument();
  });

  it("con una sola tarjeta no muestra el selector", async () => {
    mockFetch({ statements: [VISA] });
    renderWithProviders(<StatementReviewSection />);
    expect(await screen.findByText("COMERCIO UNO")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "resumen a revisar" })).not.toBeInTheDocument();
  });

  it("sin resúmenes importados no muestra nada", async () => {
    mockFetch({ statements: [] });
    renderWithProviders(<StatementReviewSection />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Revisión antes de pagar" })).not.toBeInTheDocument();
  });
});

describe("StatementReviewSection en mobile", () => {
  beforeEach(() => {
    emulateMobile();
  });

  it("apila el selector y cada fila es un objetivo táctil de 44px", async () => {
    renderWithProviders(<StatementReviewSection />);
    const group = await picker();
    expect(group.className).toContain("MuiToggleButtonGroup-vertical");
    expect(cssFor(within(group).getByRole("button", { name: /ICBC/ }))).toContain("min-height:44px");
    const checkbox = await screen.findByRole("checkbox", { name: "revisado: COMERCIO UNO" });
    expect(cssFor(checkbox.closest('[role="button"]') as Element)).toContain("min-height:44px");
    const markAll = screen.getByRole("button", { name: "Marcar todo como revisado" });
    expect(markAll.className).toContain("MuiButton-fullWidth");
    expect(cssFor(markAll)).toContain("min-height:44px");
  });
});
