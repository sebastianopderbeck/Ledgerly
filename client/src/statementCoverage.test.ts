import { describe, it, expect } from "vitest";
import type { StatementDTO } from "@ledgerly/shared";
import { completeMonthRange } from "./statementCoverage.js";

const makeStatement = (issuer: StatementDTO["issuer"], closingDate: string | null): StatementDTO => ({
  id: `${issuer}-${closingDate}`,
  issuer,
  cardLabel: issuer === "icbc" ? "ICBC" : "Visa Signature",
  last4: "1234",
  closingDate,
  dueDate: null,
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 0, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "x.pdf",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt: "2026-07-01T00:00:00.000Z",
});

describe("completeMonthRange", () => {
  it("con un emisor va del mes del primer cierre al mes anterior al último cierre", () => {
    const statements = [makeStatement("icbc", "2026-06-07"), makeStatement("icbc", "2026-07-07")];
    expect(completeMonthRange(statements)).toEqual({ desde: "2026-06", hasta: "2026-06" });
  });

  it("un cierre el último día del mes deja ese mes completo", () => {
    const statements = [makeStatement("icbc", "2026-08-31"), makeStatement("icbc", "2026-09-30")];
    expect(completeMonthRange(statements)).toEqual({ desde: "2026-08", hasta: "2026-09" });
  });

  it("con dos emisores termina donde termina el que cerró antes", () => {
    const statements = [
      makeStatement("visa_signature", "2026-07-02"),
      makeStatement("visa_signature", "2026-10-02"),
      makeStatement("icbc", "2026-07-07"),
      makeStatement("icbc", "2026-09-07"),
    ];
    expect(completeMonthRange(statements)).toEqual({ desde: "2026-07", hasta: "2026-08" });
  });

  it("arranca cuando todos los emisores tienen su primer resumen", () => {
    const statements = [
      makeStatement("visa_signature", "2025-03-02"),
      makeStatement("visa_signature", "2025-09-02"),
      makeStatement("icbc", "2025-06-07"),
      makeStatement("icbc", "2025-09-07"),
    ];
    expect(completeMonthRange(statements)).toEqual({ desde: "2025-06", hasta: "2025-08" });
  });

  it("con un solo resumen no hay meses completos", () => {
    expect(completeMonthRange([makeStatement("icbc", "2026-07-07")])).toBeNull();
  });

  it("ignora los resúmenes sin fecha de cierre", () => {
    const statements = [
      makeStatement("icbc", "2026-06-07"),
      makeStatement("icbc", "2026-07-07"),
      makeStatement("visa_signature", null),
    ];
    expect(completeMonthRange(statements)).toEqual({ desde: "2026-06", hasta: "2026-06" });
  });

  it("sin ningún cierre devuelve null", () => {
    expect(completeMonthRange([makeStatement("visa_signature", null), makeStatement("icbc", null)])).toBeNull();
    expect(completeMonthRange([])).toBeNull();
  });
});
