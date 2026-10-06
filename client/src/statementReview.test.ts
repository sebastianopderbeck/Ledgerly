import { describe, it, expect } from "vitest";
import type {
  ReviewCategoryFinding, ReviewTransactionFinding, StatementDTO, StatementReviewDTO, TransactionDTO,
} from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import {
  applyReviewedDelta,
  categoryFindingBadge,
  categoryFindingNote,
  historyCaption,
  reviewCheckSummary,
  reviewOptions,
  reviewProgress,
  selectedReviewId,
  splitFindings,
  statementCaption,
  transactionFindingNotes,
} from "./statementReview.js";

const statement = (id: string, overrides: Partial<StatementDTO> = {}): StatementDTO => ({
  id,
  issuer: "visa_signature",
  cardLabel: "Visa Signature ****1234",
  last4: "1234",
  closingDate: "2026-09-25",
  dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 1234567.89, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: `${id}.pdf`,
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt: "2026-09-26T12:00:00.000Z",
  ...overrides,
});

const transaction = (id: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO => ({
  id, statementId: "s1", issuer: "visa_signature", cardLabel: "Visa Signature ****1234", date: "2026-09-12",
  descriptionRaw: "COMERCIO UNO", merchant: "COMERCIO UNO", category: "Comida", categorySource: "rule",
  amount: 2500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
  installmentCurrent: null, installmentTotal: null, comprobante: null, ...overrides,
});

const txFinding = (id: string, overrides: Partial<ReviewTransactionFinding> = {}): ReviewTransactionFinding => ({
  kind: "transaction",
  key: `tx:${id}`,
  transaction: transaction(id),
  reasons: ["sin-categoria"],
  duplicateOf: null,
  usualUsd: null,
  ...overrides,
});

const catFinding = (category: string, overrides: Partial<ReviewCategoryFinding> = {}): ReviewCategoryFinding => ({
  kind: "category", key: `cat:${category}`, category, total: 450000, average: 250000, ratio: 1.8, ...overrides,
});

const reviewWith = (overrides: Partial<StatementReviewDTO> = {}): StatementReviewDTO => ({
  statement: statement("s1"),
  previousStatements: 9,
  historyStatements: 6,
  skippedChecks: [],
  findings: [],
  reviewedKeys: [],
  ...overrides,
});

describe("applyReviewedDelta", () => {
  it("tildar agrega las claves al final, sin repetir y manteniendo el orden", () => {
    expect(applyReviewedDelta(["tx:a"], ["tx:b", "tx:a", "tx:b"], true)).toEqual(["tx:a", "tx:b"]);
  });

  it("destildar saca las claves", () => {
    expect(applyReviewedDelta(["tx:a", "cat:Comida", "tx:b"], ["cat:Comida"], false)).toEqual(["tx:a", "tx:b"]);
  });

  it("es idempotente", () => {
    const once = applyReviewedDelta(["tx:a"], ["tx:b"], true);
    expect(applyReviewedDelta(once, ["tx:b"], true)).toEqual(once);
    expect(applyReviewedDelta(["tx:a"], ["tx:z"], false)).toEqual(["tx:a"]);
  });

  it("no deja duplicados que ya vinieran en la lista", () => {
    expect(applyReviewedDelta(["tx:a", "tx:a"], [], true)).toEqual(["tx:a"]);
  });
});

describe("reviewOptions", () => {
  const visaOld = statement("v1", { closingDate: "2026-08-25" });
  const visaNew = statement("v2", { closingDate: "2026-09-25" });
  const icbc = statement("i1", { issuer: "icbc", cardLabel: "ICBC", closingDate: "2026-09-20" });

  it("ofrece el último resumen de cada tarjeta", () => {
    expect(reviewOptions([visaOld, icbc, visaNew], null)).toEqual([
      { statement: visaNew, isLatest: true },
      { statement: icbc, isLatest: true },
    ]);
  });

  it("un foco que no es el último va primero", () => {
    const options = reviewOptions([visaOld, icbc, visaNew], visaOld);
    expect(options.map((option) => [option.statement.id, option.isLatest])).toEqual([["v1", false], ["v2", true], ["i1", true]]);
  });

  it("un foco que ya es el último no se repite", () => {
    expect(reviewOptions([visaOld, icbc, visaNew], visaNew).map((option) => option.statement.id)).toEqual(["v2", "i1"]);
  });

  it("sin una lista válida queda solo el foco, o nada", () => {
    expect(reviewOptions(undefined, null)).toEqual([]);
    expect(reviewOptions({} as unknown as StatementDTO[], null)).toEqual([]);
    expect(reviewOptions(undefined, visaOld)).toEqual([{ statement: visaOld, isLatest: false }]);
  });
});

describe("selectedReviewId", () => {
  const options = [{ id: "v2" }, { id: "i1" }];

  it("respeta la elección si sigue entre las opciones", () => {
    expect(selectedReviewId(options, "i1")).toBe("i1");
  });

  it("sin elección, o si el resumen elegido ya no está, toma la primera opción", () => {
    expect(selectedReviewId(options, null)).toBe("v2");
    expect(selectedReviewId(options, "borrado")).toBe("v2");
    expect(selectedReviewId([], "borrado")).toBeNull();
  });
});

describe("reviewProgress", () => {
  it("cuenta solo las claves de los hallazgos actuales", () => {
    const findings = [txFinding("a"), txFinding("b"), catFinding("Comida")];
    expect(reviewProgress(findings, ["tx:a", "tx:vieja"])).toEqual({
      reviewed: 1, total: 3, pending: 2, done: false, pendingKeys: ["tx:b", "cat:Comida"],
    });
  });

  it("con todo tildado está hecho", () => {
    expect(reviewProgress([txFinding("a")], ["tx:a"])).toMatchObject({ reviewed: 1, pending: 0, done: true });
  });

  it("sin hallazgos está hecho", () => {
    expect(reviewProgress([], ["tx:vieja"])).toEqual({ reviewed: 0, total: 0, pending: 0, done: true, pendingKeys: [] });
  });
});

describe("splitFindings", () => {
  it("separa movimientos y categorías sin cambiar el orden", () => {
    const findings = [txFinding("a"), catFinding("Comida"), txFinding("b")];
    const { transactions, categories } = splitFindings(findings);
    expect(transactions.map((finding) => finding.key)).toEqual(["tx:a", "tx:b"]);
    expect(categories.map((finding) => finding.key)).toEqual(["cat:Comida"]);
  });
});

describe("reviewCheckSummary", () => {
  it("cuenta motivos por chequeo y marca los salteados", () => {
    const review = reviewWith({
      skippedChecks: ["categoria"],
      findings: [
        txFinding("a", { reasons: ["duplicado"] }),
        txFinding("b", { reasons: ["usd", "nuevo", "sin-categoria"] }),
        txFinding("c", { reasons: ["nuevo"] }),
      ],
    });
    expect(reviewCheckSummary(review)).toEqual([
      { check: "duplicado", label: "Duplicados", count: 1, skipped: false },
      { check: "usd", label: "USD inusuales", count: 1, skipped: false },
      { check: "nuevo", label: "Comercios nuevos", count: 2, skipped: false },
      { check: "categoria", label: "Categorías en alza", count: 0, skipped: true },
      { check: "sin-categoria", label: "Sin categoría", count: 1, skipped: false },
    ]);
  });

  it("las categorías en alza cuentan hallazgos de categoría", () => {
    const summary = reviewCheckSummary(reviewWith({ findings: [catFinding("A"), catFinding("B")] }));
    expect(summary.find((item) => item.check === "categoria")).toMatchObject({ count: 2, skipped: false });
  });
});

describe("transactionFindingNotes", () => {
  it("un duplicado en el mismo resumen", () => {
    const finding = txFinding("a", {
      reasons: ["duplicado"],
      duplicateOf: { transactionId: "z", date: "2026-09-11", sameStatement: true },
    });
    expect(transactionFindingNotes(finding, 6)).toEqual(["Mismo comercio y monto que el cargo del 2026-09-11."]);
  });

  it("un duplicado contra un resumen anterior", () => {
    const finding = txFinding("a", {
      reasons: ["duplicado"],
      duplicateOf: { transactionId: "z", date: "2026-08-29", sameStatement: false },
    });
    expect(transactionFindingNotes(finding, 6)).toEqual([
      "Mismo comercio y monto que un cargo del 2026-08-29, en un resumen anterior.",
    ]);
  });

  it("un cargo en USD de un comercio sin cargos en USD", () => {
    const finding = txFinding("a", { reasons: ["usd"], usualUsd: null });
    expect(transactionFindingNotes(finding, 6)).toEqual(["Sin cargos en USD de este comercio en los últimos 6 resúmenes."]);
    expect(transactionFindingNotes(finding, 1)).toEqual(["Sin cargos en USD de este comercio en el resumen anterior."]);
  });

  it("un cargo en USD que subió", () => {
    const finding = txFinding("a", {
      reasons: ["usd"],
      usualUsd: 10.99,
      transaction: transaction("a", { amount: 14.99, currency: "USD" }),
    });
    expect(transactionFindingNotes(finding, 6)).toEqual([`Hasta ahora, como mucho ${formatMoney(10.99, "USD")} (+36,4%).`]);
  });

  it("los otros motivos no agregan notas", () => {
    expect(transactionFindingNotes(txFinding("a", { reasons: ["nuevo", "sin-categoria"] }), 6)).toEqual([]);
  });
});

describe("textos de las categorías en alza", () => {
  it("la nota muestra el promedio, o que no había gasto", () => {
    expect(categoryFindingNote(catFinding("Supermercado"), 6))
      .toBe(`Promedio de los últimos 6 resúmenes: ${formatMoney(250000, "ARS")}`);
    expect(categoryFindingNote(catFinding("Viajes", { average: 0, ratio: null }), 6)).toBe("Sin gasto en los últimos 6 resúmenes");
  });

  it("el badge muestra la suba, o «Nueva»", () => {
    expect(categoryFindingBadge(catFinding("Supermercado"))).toBe("+80,0%");
    expect(categoryFindingBadge(catFinding("Viajes", { average: 0, ratio: null }))).toBe("Nueva");
  });
});

describe("historyCaption", () => {
  it("el primer resumen de la tarjeta", () => {
    expect(historyCaption(reviewWith({ previousStatements: 0, historyStatements: 0, skippedChecks: ["usd", "nuevo", "categoria"] })))
      .toBe("Es el primer resumen de esta tarjeta: solo se buscan duplicados y movimientos sin categoría.");
  });

  it("con poca historia, en singular y en plural", () => {
    expect(historyCaption(reviewWith({ previousStatements: 1, historyStatements: 1, skippedChecks: ["categoria"] })))
      .toBe("Comparado con 1 resumen anterior. Para comparar categorías hacen falta 3.");
    expect(historyCaption(reviewWith({ previousStatements: 2, historyStatements: 2, skippedChecks: ["categoria"] })))
      .toBe("Comparado con 2 resúmenes anteriores. Para comparar categorías hacen falta 3.");
  });

  it("con la ventana completa", () => {
    expect(historyCaption(reviewWith())).toBe("Comparado con los 6 resúmenes anteriores de esta tarjeta.");
  });
});

describe("statementCaption", () => {
  it("cierre, vencimiento y saldo en pesos", () => {
    expect(statementCaption(statement("s1")))
      .toBe(`Cierre 2026-09-25 · Vence 2026-10-06 · Saldo ${formatMoney(1234567.89, "ARS")}`);
  });

  it("suma el saldo en dólares solo si hay", () => {
    const withUsd = statement("s1", {
      totals: { ...statement("s1").totals, saldoActual: { ars: 1000, usd: 45 } },
    });
    expect(statementCaption(withUsd)).toBe(
      `Cierre 2026-09-25 · Vence 2026-10-06 · Saldo ${formatMoney(1000, "ARS")} + ${formatMoney(45, "USD")}`,
    );
  });

  it("las fechas que faltan van como guion", () => {
    expect(statementCaption(statement("s1", { closingDate: null, dueDate: null })))
      .toBe(`Cierre — · Vence — · Saldo ${formatMoney(1234567.89, "ARS")}`);
  });
});
