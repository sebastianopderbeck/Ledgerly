import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { CardCycleSummary } from "./CardCycleSummary.js";

const statements = [
  {
    id: "v1", issuer: "visa_signature", cardLabel: "Visa Signature", last4: "5678",
    closingDate: "2026-07-12", dueDate: "2026-07-25",
    totals: {
      totalConsumos: { ars: 0, usd: 0 },
      saldoActual: { ars: 534567, usd: 456.78 },
      pagoMinimo: { ars: 90000, usd: 0 },
      saldoAnterior: { ars: 0, usd: 0 },
    },
    sourceFileName: "v.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
    transactionCount: 0, uploadedAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "i1", issuer: "icbc", cardLabel: "ICBC", last4: "1234",
    closingDate: "2026-07-07", dueDate: "2026-07-20",
    totals: {
      totalConsumos: { ars: 0, usd: 0 },
      saldoActual: { ars: 700000, usd: 0 },
      pagoMinimo: { ars: 120000, usd: 0 },
      saldoAnterior: { ars: 0, usd: 0 },
    },
    sourceFileName: "i.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
    transactionCount: 0, uploadedAt: "2026-07-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(url.includes("/statements") ? statements : {}), {
      status: 200, headers: { "Content-Type": "application/json" },
    })));
});
afterEach(() => vi.restoreAllMocks());

describe("CardCycleSummary", () => {
  it("muestra el título, el total combinado y el desglose por banco", async () => {
    renderWithProviders(<CardCycleSummary />, { route: "/" });
    await waitFor(() => expect(screen.getByText("A pagar al cierre")).toBeInTheDocument());
    expect(screen.getByText((text) => text.includes("1.234.567"))).toBeInTheDocument();
    expect(screen.getByText(/Visa Signature/)).toBeInTheDocument();
    expect(screen.getByText(/ICBC/)).toBeInTheDocument();
    expect(screen.getByText(/corte 2026-07-07 · vence 2026-07-20/)).toBeInTheDocument();
  });
});
