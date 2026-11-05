import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { cardServiceDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { TEST_AUTH_CONFIG, withAuthedApi } from "../../testing/auth.js";
import { createApp } from "../app.js";
import { CardServiceModel, ManualSubscriptionModel, StatementModel, TransactionModel } from "../../db/models.js";
import { ownedBy } from "../../testing/ownedBy.js";

withDb();
const app = createApp(TEST_AUTH_CONFIG);
const auth = withAuthedApi(app);

interface TxSeed {
  date: string;
  merchant: string;
  amount: number;
  currency?: "ARS" | "USD";
  isInstallment?: boolean;
}

const zero = { ars: 0, usd: 0 };

async function seedVisa(rows: TxSeed[], userId: Types.ObjectId = auth.userId): Promise<void> {
  const statement = await StatementModel.create({
    userId,
    issuer: "visa_signature", cardLabel: "Visa Signature", last4: "1234", closingDate: new Date("2026-09-28"),
    dueDate: null, totals: { totalConsumos: zero, saldoActual: zero, pagoMinimo: zero, saldoAnterior: zero },
    sourceFileName: "visa.pdf", sourceHash: `visa-${String(userId)}`, pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.insertMany(ownedBy(userId, rows.map(({ date, merchant, amount, currency = "ARS", isInstallment = false }, index) => ({
    statementId: statement._id, issuer: "visa_signature", cardLabel: "Visa Signature", date: new Date(date),
    descriptionRaw: merchant, merchant, category: "Servicios", categorySource: "rule", amount, currency, direction: "debit",
    type: "purchase", isInstallment, installmentCurrent: isInstallment ? 1 : null, installmentTotal: isInstallment ? 6 : null,
    comprobante: null, fingerprint: `fp-${String(userId)}-${index}`,
  }))));
}

const idOf = async (merchant: string, date: string, userId: Types.ObjectId = auth.userId): Promise<string> => {
  const doc = await TransactionModel.findOne({ userId, merchant, date: new Date(date) }).lean();
  return String(doc?._id);
};

const mark = (body: object) => auth.api.post("/api/card-services").send(body);

const list = async () => cardServiceDtoSchema.array().parse((await auth.api.get("/api/card-services")).body);

const gasco = (): TxSeed[] => [
  { date: "2026-08-20", merchant: "GASCO", amount: 18_000 },
  { date: "2026-09-20", merchant: "GASCO", amount: 20_000 },
];

describe("GET /api/card-services", () => {
  it("sin marcas devuelve la lista vacía", async () => {
    await seedVisa(gasco());
    expect(await list()).toEqual([]);
  });

  it("no lista una marca sin cargos", async () => {
    await CardServiceModel.create({ userId: auth.userId, key: "NADA" });
    expect(await list()).toEqual([]);
  });
});

describe("POST /api/card-services", () => {
  it("marcar un movimiento lista el servicio con su último cargo", async () => {
    await seedVisa(gasco());
    const res = await mark({ transactionId: await idOf("GASCO", "2026-08-20") });
    expect(res.status).toBe(204);
    expect(await list()).toEqual([{
      key: "GASCO", nombre: "GASCO", issuer: "visa_signature", cardLabel: "Visa Signature",
      ultimoMonto: 38_000, ultimoCargo: "2026-09-20",
    }]);
  });

  it("marcar dos veces deja una sola marca", async () => {
    await seedVisa(gasco());
    const transactionId = await idOf("GASCO", "2026-09-20");
    expect((await mark({ transactionId: `  ${transactionId}  ` })).status).toBe(204);
    expect((await mark({ transactionId })).status).toBe(204);
    expect(await CardServiceModel.countDocuments({ userId: auth.userId })).toBe(1);
  });

  it.each([
    ["en cuotas", { date: "2026-09-21", merchant: "GASCO", amount: 5_000, isInstallment: true }],
    ["en dólares", { date: "2026-09-21", merchant: "GASCO", amount: 5, currency: "USD" as const }],
  ])("rechaza un movimiento %s", async (_label, row) => {
    await seedVisa([row]);
    const res = await mark({ transactionId: await idOf("GASCO", "2026-09-21") });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Movimiento inválido" });
    expect(await CardServiceModel.countDocuments({ userId: auth.userId })).toBe(0);
  });

  it.each([
    ["sin movimiento", {}],
    ["con el movimiento en blanco", { transactionId: "   " }],
  ])("responde 400 %s", async (_label, body) => {
    const res = await mark(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Movimiento inválido" });
  });

  it("no marca movimientos de otro usuario ni ids inválidos", async () => {
    const otro = new Types.ObjectId();
    await seedVisa(gasco(), otro);
    for (const transactionId of [await idOf("GASCO", "2026-09-20", otro), "no-es-un-id"]) {
      const res = await mark({ transactionId });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Movimiento no encontrado" });
    }
    expect(await CardServiceModel.countDocuments({})).toBe(0);
  });

  it("un comercio sin palabras responde 400", async () => {
    await seedVisa([{ date: "2026-09-21", merchant: "123456 7890", amount: 5_000 }]);
    const res = await mark({ transactionId: await idOf("123456 7890", "2026-09-21") });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Este comercio no tiene un nombre reconocible" });
  });

  it("marcar no toca la marca de suscripción", async () => {
    await seedVisa(gasco());
    await ManualSubscriptionModel.create({ userId: auth.userId, key: "GASCO", cobros: [] });
    expect((await mark({ transactionId: await idOf("GASCO", "2026-09-20") })).status).toBe(204);
    expect(await ManualSubscriptionModel.countDocuments({ userId: auth.userId, key: "GASCO" })).toBe(1);
  });
});

describe("DELETE /api/card-services/:key", () => {
  it("quitar con la clave canónica borra la marca de una variante", async () => {
    await seedVisa([
      { date: "2026-08-20", merchant: "CAFE SERVIC", amount: 9_000 },
      { date: "2026-09-20", merchant: "CAFE SERVICIO", amount: 9_500 },
    ]);
    await mark({ transactionId: await idOf("CAFE SERVICIO", "2026-09-20") });
    expect((await list()).map(({ key }) => key)).toEqual(["CAFE SERVIC"]);
    const res = await auth.api.delete("/api/card-services/CAFE%20SERVIC");
    expect(res.status).toBe(204);
    expect(await CardServiceModel.countDocuments({ userId: auth.userId })).toBe(0);
    expect(await list()).toEqual([]);
  });

  it("una clave demasiado larga responde 400", async () => {
    const res = await auth.api.delete(`/api/card-services/${"X".repeat(61)}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Clave inválida" });
  });
});
