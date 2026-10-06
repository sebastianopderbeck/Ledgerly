import { describe, it, expect } from "vitest";
import type { ReviewCategoryFinding, ReviewReason, ReviewTransactionFinding, TransactionDTO } from "@ledgerly/shared";
import {
  buildStatementReview,
  charges,
  isOldInstallment,
  purchases,
  signedAmount,
  type StatementReviewInput,
  type StatementReviewResult,
} from "./statementReview.js";

const tx = (id: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO => ({
  id,
  statementId: "s-actual",
  issuer: "visa_signature",
  cardLabel: "Visa Signature ****1234",
  date: "2026-09-10",
  descriptionRaw: "COMERCIO UNO",
  merchant: "COMERCIO UNO",
  category: "Comida",
  categorySource: "rule",
  amount: 2500,
  currency: "ARS",
  direction: "debit",
  type: "purchase",
  isInstallment: false,
  installmentCurrent: null,
  installmentTotal: null,
  comprobante: null,
  ...overrides,
});

const old = (id: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO =>
  tx(id, { statementId: "s-anterior", ...overrides });

const review = (input: Partial<StatementReviewInput>): StatementReviewResult =>
  buildStatementReview({ current: [], history: [], knownMerchants: [], previousStatements: 0, ...input });

const txFindings = (result: StatementReviewResult): ReviewTransactionFinding[] =>
  result.findings.filter((finding): finding is ReviewTransactionFinding => finding.kind === "transaction");

const categoryFindings = (result: StatementReviewResult): ReviewCategoryFinding[] =>
  result.findings.filter((finding): finding is ReviewCategoryFinding => finding.kind === "category");

const findingOf = (result: StatementReviewResult, id: string): ReviewTransactionFinding | undefined =>
  txFindings(result).find((finding) => finding.transaction.id === id);

const reasonsOf = (result: StatementReviewResult, id: string): ReviewReason[] => findingOf(result, id)?.reasons ?? [];

const statementWith = (prefix: string, totals: Record<string, number>): TransactionDTO[] =>
  Object.entries(totals).map(([category, amount], position) =>
    tx(`${prefix}${position}`, { category, amount, merchant: `COMERCIO ${prefix}${position}` }));

const threeStatementsWith = (totals: Record<string, number>): TransactionDTO[][] =>
  ["a", "b", "c"].map((prefix) => statementWith(prefix, totals));

describe("auxiliares", () => {
  it("purchases deja las compras y charges, además, solo los cargos", () => {
    const list = [tx("a"), tx("b", { direction: "credit" }), tx("c", { type: "tax" })];
    expect(purchases(list).map((item) => item.id)).toEqual(["a", "b"]);
    expect(charges(list).map((item) => item.id)).toEqual(["a"]);
  });

  it("una cuota vieja es de la 2 en adelante", () => {
    expect(isOldInstallment(tx("a", { isInstallment: true, installmentCurrent: 2, installmentTotal: 6 }))).toBe(true);
    expect(isOldInstallment(tx("b", { isInstallment: true, installmentCurrent: 1, installmentTotal: 6 }))).toBe(false);
    expect(isOldInstallment(tx("c"))).toBe(false);
  });

  it("las devoluciones restan", () => {
    expect(signedAmount(tx("a", { amount: 100 }))).toBe(100);
    expect(signedAmount(tx("b", { amount: 100, direction: "credit" }))).toBe(-100);
  });
});

describe("posibles duplicados", () => {
  it("dentro del resumen marca el posterior, que apunta al anterior", () => {
    const result = review({ current: [tx("t2", { date: "2026-09-11" }), tx("t1", { date: "2026-09-10" })] });
    expect(reasonsOf(result, "t1")).toEqual([]);
    expect(findingOf(result, "t2")).toMatchObject({
      reasons: ["duplicado"],
      duplicateOf: { transactionId: "t1", date: "2026-09-10", sameStatement: true },
      usualUsd: null,
    });
  });

  it("contra el resumen anterior, a 2 días", () => {
    const result = review({
      current: [tx("t1", { date: "2026-09-01" })],
      history: [[old("h1", { date: "2026-08-30" })]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(findingOf(result, "t1")).toMatchObject({
      reasons: ["duplicado"],
      duplicateOf: { transactionId: "h1", date: "2026-08-30", sameStatement: false },
    });
  });

  it("apunta al cargo de fecha más cercana", () => {
    const result = review({
      current: [tx("t1", { date: "2026-09-09" }), tx("t2", { date: "2026-09-10" })],
      history: [[old("h1", { date: "2026-09-07" })]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(findingOf(result, "t1")?.duplicateOf?.transactionId).toBe("h1");
    expect(findingOf(result, "t2")?.duplicateOf?.transactionId).toBe("t1");
  });

  it("a igual distancia prefiere el del mismo resumen", () => {
    const result = review({
      current: [tx("t1", { date: "2026-09-09" }), tx("t2", { date: "2026-09-10" })],
      history: [[old("h1", { date: "2026-09-11" })]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(findingOf(result, "t2")?.duplicateOf).toEqual({ transactionId: "t1", date: "2026-09-09", sameStatement: true });
  });

  it("no son duplicados: a 4 días, otro monto u otra moneda", () => {
    const result = review({
      current: [
        tx("t1", { date: "2026-09-01" }),
        tx("t2", { date: "2026-09-05" }),
        tx("t3", { date: "2026-09-05", amount: 2600 }),
        tx("t4", { date: "2026-09-05", currency: "USD" }),
      ],
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("no son duplicados: dos cuotas distintas de la misma compra", () => {
    const purchase = { isInstallment: true, installmentTotal: 6, date: "2026-05-10" };
    const result = review({
      current: [tx("t1", { ...purchase, installmentCurrent: 3 })],
      history: [[old("h1", { ...purchase, installmentCurrent: 2 })]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("la misma cuota cobrada dos veces sí es duplicado", () => {
    const installment = { isInstallment: true, installmentCurrent: 3, installmentTotal: 6, date: "2026-05-10" };
    const result = review({
      current: [tx("t1", { ...installment, comprobante: "001" }), tx("t2", { ...installment, comprobante: "002" })],
    });
    expect(reasonsOf(result, "t2")).toEqual(["duplicado"]);
  });

  it("no son duplicados: una devolución ni un impuesto", () => {
    const result = review({
      current: [
        tx("t1"),
        tx("t2", { direction: "credit" }),
        tx("t3", { type: "tax", category: "Impuestos" }),
      ],
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("tres cargos iguales dan dos hallazgos", () => {
    const result = review({ current: [tx("t1"), tx("t2"), tx("t3")] });
    expect(txFindings(result).map((finding) => [finding.transaction.id, finding.duplicateOf?.transactionId]))
      .toEqual([["t2", "t1"], ["t3", "t1"]]);
  });
});

describe("USD fuera de lo habitual", () => {
  const usd = (id: string, amount: number, overrides: Partial<TransactionDTO> = {}): TransactionDTO =>
    tx(id, { merchant: "SERVICIO EXTERIOR", category: "Suscripciones", currency: "USD", amount, ...overrides });
  const known = { knownMerchants: ["SERVICIO EXTERIOR"], previousStatements: 2 };

  it("un comercio sin cargos en USD en la ventana se marca, sin monto habitual", () => {
    const result = review({ ...known, current: [usd("t1", 14.99)], history: [[old("h1")]] });
    expect(findingOf(result, "t1")).toMatchObject({ key: "tx:t1", reasons: ["usd"], usualUsd: null, duplicateOf: null });
  });

  it("una suba del 36 % se marca, con el monto anterior", () => {
    const result = review({ ...known, current: [usd("t1", 14.99)], history: [[usd("h1", 10.99, { date: "2026-08-03" })]] });
    expect(findingOf(result, "t1")).toMatchObject({ reasons: ["usd"], usualUsd: 10.99 });
  });

  it("una suba del 10 % no se marca", () => {
    const result = review({ ...known, current: [usd("t1", 12.09)], history: [[usd("h1", 10.99, { date: "2026-08-03" })]] });
    expect(txFindings(result)).toEqual([]);
  });

  it("compara contra el máximo de la ventana, no contra el promedio", () => {
    const result = review({
      ...known,
      current: [usd("t1", 13.5)],
      history: [[usd("h1", 9.99, { date: "2026-08-03" })], [usd("h2", 12, { date: "2026-07-03" })]],
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("una cuota vieja en USD no se marca", () => {
    const result = review({
      ...known,
      current: [usd("t1", 50, { merchant: "TIENDA EXTERIOR", isInstallment: true, installmentCurrent: 2, installmentTotal: 3 })],
      history: [[old("h1")]],
    });
    expect(txFindings(result)).toEqual([]);
  });

  it("sin resúmenes anteriores el chequeo se saltea", () => {
    const result = review({ current: [usd("t1", 14.99)] });
    expect(result.skippedChecks).toContain("usd");
    expect(txFindings(result)).toEqual([]);
  });

  it("el monto o la palabra USD en el nombre no lo vuelven otro comercio", () => {
    const result = review({
      knownMerchants: ["SERVICIO EXTERIOR USD 10,99"],
      previousStatements: 1,
      current: [usd("t1", 11.5, { merchant: "SERVICIO EXTERIOR X9Y8" })],
      history: [[usd("h1", 10.99, { merchant: "SERVICIO EXTERIOR USD 10,99", date: "2026-08-03" })]],
    });
    expect(txFindings(result)).toEqual([]);
  });
});

describe("comercios nuevos", () => {
  const someHistory = { history: [[old("h1", { date: "2026-08-10" })]], previousStatements: 3 };

  it("un comercio que la tarjeta nunca usó se marca, uno conocido no", () => {
    const result = review({
      ...someHistory,
      knownMerchants: ["COMERCIO UNO"],
      current: [tx("t1"), tx("t2", { merchant: "COMERCIO NUEVO" })],
    });
    expect(reasonsOf(result, "t1")).toEqual([]);
    expect(findingOf(result, "t2")).toMatchObject({ key: "tx:t2", reasons: ["nuevo"] });
  });

  it("el mismo comercio con otro código no es nuevo", () => {
    const result = review({ ...someHistory, knownMerchants: ["SPOTIFY P1"], current: [tx("t1", { merchant: "SPOTIFY X9" })] });
    expect(txFindings(result)).toEqual([]);
  });

  it("una cuota vieja no es nueva, la primera cuota sí", () => {
    const result = review({
      ...someHistory,
      knownMerchants: ["COMERCIO UNO"],
      current: [
        tx("t1", { merchant: "COMERCIO NUEVO", isInstallment: true, installmentCurrent: 3, installmentTotal: 6, date: "2026-07-10" }),
        tx("t2", { merchant: "OTRO NUEVO", isInstallment: true, installmentCurrent: 1, installmentTotal: 6 }),
      ],
    });
    expect(reasonsOf(result, "t1")).toEqual([]);
    expect(reasonsOf(result, "t2")).toEqual(["nuevo"]);
  });

  it("una devolución no es un comercio nuevo", () => {
    const result = review({ ...someHistory, current: [tx("t1", { merchant: "COMERCIO NUEVO", direction: "credit" })] });
    expect(txFindings(result)).toEqual([]);
  });

  it("marca cada cargo de un comercio nuevo", () => {
    const result = review({
      ...someHistory,
      current: [
        tx("t1", { merchant: "COMERCIO NUEVO", date: "2026-09-01" }),
        tx("t2", { merchant: "COMERCIO NUEVO", date: "2026-09-20", amount: 999 }),
      ],
    });
    expect(txFindings(result).map((finding) => finding.transaction.id)).toEqual(["t1", "t2"]);
  });

  it("sin resúmenes anteriores el chequeo se saltea", () => {
    const result = review({ current: [tx("t1", { merchant: "COMERCIO NUEVO" })] });
    expect(result.skippedChecks).toContain("nuevo");
    expect(txFindings(result)).toEqual([]);
  });
});

describe("categorías en alza", () => {
  it("marca la categoría que duplica su promedio y pesa más del 5 % del resumen", () => {
    const result = review({
      current: statementWith("t", { Supermercado: 400000, Comida: 50000, Varios: 550000 }),
      history: threeStatementsWith({ Supermercado: 200000, Comida: 25000, Varios: 550000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([
      { kind: "category", key: "cat:Supermercado", category: "Supermercado", total: 400000, average: 200000, ratio: 2 },
    ]);
  });

  it("una suba de 1,3 veces no se marca", () => {
    const result = review({
      current: statementWith("t", { Supermercado: 260000, Varios: 740000 }),
      history: threeStatementsWith({ Supermercado: 200000, Varios: 740000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });

  it("una categoría que no estaba en la ventana se marca sin ratio", () => {
    const result = review({
      current: statementWith("t", { Viajes: 100000, Varios: 900000 }),
      history: threeStatementsWith({ Varios: 900000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([
      { kind: "category", key: "cat:Viajes", category: "Viajes", total: 100000, average: 0, ratio: null },
    ]);
  });

  it("«Sin categoría» no es una categoría en alza", () => {
    const result = review({
      current: statementWith("t", { "Sin categoría": 300000, Varios: 700000 }),
      history: threeStatementsWith({ Varios: 700000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });

  it("el promedio cuenta como cero los resúmenes sin esa categoría", () => {
    const result = review({
      current: statementWith("t", { Supermercado: 200000, Varios: 500000 }),
      history: [
        statementWith("a", { Supermercado: 300000, Varios: 500000 }),
        statementWith("b", { Varios: 500000 }),
        statementWith("c", { Varios: 500000 }),
      ],
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([
      { kind: "category", key: "cat:Supermercado", category: "Supermercado", total: 200000, average: 100000, ratio: 2 },
    ]);
  });

  it("con menos de 3 resúmenes anteriores el chequeo se saltea", () => {
    const result = review({
      current: statementWith("t", { Supermercado: 400000 }),
      history: [statementWith("a", { Supermercado: 1 }), statementWith("b", { Supermercado: 1 })],
      previousStatements: 2,
    });
    expect(result.skippedChecks).toContain("categoria");
    expect(categoryFindings(result)).toEqual([]);
  });

  it("las devoluciones restan", () => {
    const result = review({
      current: [
        ...statementWith("t", { Supermercado: 400000, Varios: 600000 }),
        tx("r1", { category: "Supermercado", amount: 150000, direction: "credit" }),
      ],
      history: threeStatementsWith({ Supermercado: 200000, Varios: 600000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });

  it("los cargos en USD no entran", () => {
    const result = review({
      current: [...statementWith("t", { Varios: 1000000 }), tx("u1", { category: "Viajes", currency: "USD", amount: 900 })],
      history: threeStatementsWith({ Varios: 1000000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });

  it("si el resumen suma cero o menos no marca categorías", () => {
    const result = review({
      current: [tx("t1", { category: "Supermercado", amount: 1000 }), tx("r1", { category: "Varios", amount: 5000, direction: "credit" })],
      history: threeStatementsWith({ Varios: 1000 }),
      previousStatements: 3,
    });
    expect(categoryFindings(result)).toEqual([]);
  });
});

describe("sin categoría", () => {
  it("marca las compras sin categoría, no los pagos ni los impuestos", () => {
    const result = review({
      current: [
        tx("t1", { category: "Sin categoría" }),
        tx("t2", { category: "Sin categoría", type: "payment", direction: "credit", merchant: "SU PAGO" }),
        tx("t3", { category: "Sin categoría", type: "tax", merchant: "IVA" }),
      ],
    });
    expect(txFindings(result).map((finding) => [finding.transaction.id, finding.reasons])).toEqual([["t1", ["sin-categoria"]]]);
  });
});

describe("armado del resultado", () => {
  it("un movimiento con varios motivos es un solo hallazgo, con los motivos en orden", () => {
    const result = review({
      current: [tx("t1", { merchant: "COMERCIO NUEVO", currency: "USD", amount: 30, category: "Sin categoría" })],
      history: [[old("h1")]],
      knownMerchants: ["COMERCIO UNO"],
      previousStatements: 1,
    });
    expect(txFindings(result)).toHaveLength(1);
    expect(findingOf(result, "t1")).toMatchObject({
      key: "tx:t1",
      reasons: ["usd", "nuevo", "sin-categoria"],
      usualUsd: null,
      duplicateOf: null,
    });
  });

  it("ordena por motivo, fecha e id, y deja las categorías al final de mayor a menor diferencia", () => {
    const result = review({
      current: [
        tx("t5", { merchant: "COMERCIO SIN", category: "Sin categoría", date: "2026-09-01", amount: 10 }),
        tx("t4", { merchant: "COMERCIO NUEVO", date: "2026-09-15", amount: 20 }),
        tx("t3", { merchant: "COMERCIO NUEVO B", date: "2026-09-02", amount: 30 }),
        tx("t1", { date: "2026-09-05", amount: 40 }),
        tx("t2", { date: "2026-09-05", amount: 40 }),
        tx("big1", { category: "Viajes", amount: 300000, date: "2026-09-21" }),
        tx("big2", { category: "Supermercado", amount: 500000, date: "2026-09-20" }),
      ],
      history: ["06", "07", "08"].map((month) => [old(`h${month}`, { date: `2026-${month}-10`, amount: 100, category: "Varios" })]),
      knownMerchants: ["COMERCIO UNO", "COMERCIO SIN"],
      previousStatements: 3,
    });
    expect(result.findings.map((finding) => finding.key))
      .toEqual(["tx:t2", "tx:t3", "tx:t4", "tx:t5", "cat:Supermercado", "cat:Viajes"]);
    expect(result.skippedChecks).toEqual([]);
  });

  it("una entrada vacía no falla", () => {
    expect(review({})).toEqual({ findings: [], skippedChecks: ["usd", "nuevo", "categoria"] });
  });
});
