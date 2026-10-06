import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { ReviewFinding, StatementReviewDTO } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { StatementModel, TransactionModel } from "../../db/models.js";

withDb();
const app = createApp();

const money = { ars: 0, usd: 0 };
const MISSING_ID = "64b7f9c2a1b2c3d4e5f60718";
const NOT_FOUND = { error: "Resumen no encontrado" };

interface StatementSeed {
  issuer: "visa_signature" | "icbc";
  cardLabel: string;
  closingDate: string;
  hash: string;
}

interface TransactionSeed {
  merchant: string;
  date: string;
  amount?: number;
}

const createStatement = ({ issuer, cardLabel, closingDate, hash }: StatementSeed) =>
  StatementModel.create({
    issuer, cardLabel, last4: null, closingDate: new Date(closingDate), dueDate: null,
    totals: { totalConsumos: money, saldoActual: money, pagoMinimo: money, saldoAnterior: money },
    sourceFileName: `${hash}.pdf`, sourceHash: hash, pageCount: 1, parserVersion: "1",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });

type SeededStatement = Awaited<ReturnType<typeof createStatement>>;

const createTransaction = (statement: SeededStatement, { merchant, date, amount = 1000 }: TransactionSeed) =>
  TransactionModel.create({
    statementId: statement._id, issuer: statement.issuer, cardLabel: statement.cardLabel, date: new Date(date),
    descriptionRaw: merchant, merchant, category: "Comida", categorySource: "rule", amount, currency: "ARS",
    direction: "debit", type: "purchase", isInstallment: false, fingerprint: `${statement.issuer}|${merchant}|${date}|${amount}`,
  });

const VISA = { issuer: "visa_signature", cardLabel: "Visa Signature ****1234" } as const;

const seed = async () => {
  const visaJul = await createStatement({ ...VISA, closingDate: "2026-07-25", hash: "visa-jul" });
  const visaAug = await createStatement({ ...VISA, closingDate: "2026-08-25", hash: "visa-ago" });
  const visaSep = await createStatement({ ...VISA, closingDate: "2026-09-25", hash: "visa-sep" });
  const icbcSep = await createStatement({ issuer: "icbc", cardLabel: "ICBC", closingDate: "2026-09-20", hash: "icbc-sep" });
  await createTransaction(visaJul, { merchant: "COMERCIO UNO", date: "2026-07-10" });
  const augustCharge = await createTransaction(visaAug, { merchant: "COMERCIO UNO", date: "2026-08-24" });
  await createTransaction(visaSep, { merchant: "COMERCIO UNO", date: "2026-08-26" });
  await createTransaction(visaSep, { merchant: "TIENDA ICBC", date: "2026-09-12", amount: 5000 });
  await createTransaction(icbcSep, { merchant: "TIENDA ICBC", date: "2026-09-11", amount: 5000 });
  return { visaJul, visaAug, visaSep, icbcSep, augustCharge };
};

let ids: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  ids = await seed();
});

const getReview = async (id: string): Promise<StatementReviewDTO> => {
  const res = await request(app).get(`/api/statements/${id}/review`);
  expect(res.status).toBe(200);
  return res.body as StatementReviewDTO;
};

const findingFor = (review: StatementReviewDTO, merchant: string): ReviewFinding | undefined =>
  review.findings.find((finding) => finding.kind === "transaction" && finding.transaction.merchant === merchant);

const patchReview = (id: string, body: object) => request(app).patch(`/api/statements/${id}/review`).send(body);

describe("GET /api/statements/:id/review", () => {
  it("compara contra los resúmenes anteriores de la misma tarjeta", async () => {
    const review = await getReview(ids.visaSep._id.toString());
    expect(review).toMatchObject({
      statement: { id: ids.visaSep._id.toString(), cardLabel: "Visa Signature ****1234", transactionCount: 2 },
      previousStatements: 2,
      historyStatements: 2,
      skippedChecks: ["categoria"],
      reviewedKeys: [],
    });
  });

  it("un comercio usado solo en ICBC es nuevo en Visa, y un cargo de ICBC no lo vuelve duplicado", async () => {
    const review = await getReview(ids.visaSep._id.toString());
    expect(findingFor(review, "TIENDA ICBC")).toMatchObject({ reasons: ["nuevo"], duplicateOf: null });
  });

  it("un duplicado contra el resumen anterior apunta a ese movimiento", async () => {
    const review = await getReview(ids.visaSep._id.toString());
    expect(findingFor(review, "COMERCIO UNO")).toMatchObject({
      reasons: ["duplicado"],
      duplicateOf: { transactionId: ids.augustCharge._id.toString(), date: "2026-08-24", sameStatement: false },
    });
  });

  it("revisar un resumen viejo no usa los posteriores como historia", async () => {
    const review = await getReview(ids.visaAug._id.toString());
    expect(review).toMatchObject({ previousStatements: 1, historyStatements: 1, findings: [] });
  });

  it("el primer resumen de la tarjeta saltea los chequeos que necesitan historia", async () => {
    const review = await getReview(ids.visaJul._id.toString());
    expect(review).toMatchObject({ previousStatements: 0, historyStatements: 0, skippedChecks: ["usd", "nuevo", "categoria"] });
  });

  it("404 si el resumen no existe o el id no es válido", async () => {
    const missing = await request(app).get(`/api/statements/${MISSING_ID}/review`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(NOT_FOUND);
    const invalid = await request(app).get("/api/statements/no-es-un-id/review");
    expect(invalid.status).toBe(404);
    expect(invalid.body).toEqual(NOT_FOUND);
  });
});

describe("PATCH /api/statements/:id/review", () => {
  it("tildar agrega las claves sin repetir, y el GET las devuelve", async () => {
    const id = ids.visaSep._id.toString();
    await patchReview(id, { keys: ["tx:a", "tx:b"], reviewed: true });
    const res = await patchReview(id, { keys: ["tx:a"], reviewed: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reviewedKeys: ["tx:a", "tx:b"] });
    expect((await getReview(id)).reviewedKeys).toEqual(["tx:a", "tx:b"]);
  });

  it("destildar saca las claves, aunque alguna no estuviera", async () => {
    const id = ids.visaSep._id.toString();
    await patchReview(id, { keys: ["tx:a", "cat:Comida"], reviewed: true });
    const res = await patchReview(id, { keys: ["tx:a", "tx:zz"], reviewed: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reviewedKeys: ["cat:Comida"] });
  });

  it("400 con un cuerpo inválido", async () => {
    const id = ids.visaSep._id.toString();
    const empty = await patchReview(id, { keys: [], reviewed: true });
    expect(empty.status).toBe(400);
    expect(empty.body).toEqual({ error: "Cuerpo inválido: se espera { keys: string[], reviewed: boolean }" });
    expect((await patchReview(id, { keys: ["tx:a"] })).status).toBe(400);
  });

  it("404 si el resumen no existe o el id no es válido", async () => {
    const missing = await patchReview(MISSING_ID, { keys: ["tx:a"], reviewed: true });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(NOT_FOUND);
    expect((await patchReview("no-es-un-id", { keys: ["tx:a"], reviewed: true })).status).toBe(404);
  });
});

describe("borrar el resumen", () => {
  it("se lleva su revisión", async () => {
    const id = ids.visaSep._id.toString();
    await patchReview(id, { keys: ["tx:a"], reviewed: true });
    expect((await request(app).delete(`/api/imports/statement/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/statements/${id}/review`)).status).toBe(404);
  });
});
