import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import request from "supertest";
import { subscriptionsReportDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import {
  HiddenSubscriptionModel, ManualSubscriptionModel, StatementModel, SubscriptionCadenceModel, TransactionModel,
} from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";

withDb();
const app = createApp();
const COTIZACION = 1465;

interface TxSeed {
  date: string;
  merchant: string;
  amount: number;
  currency?: "ARS" | "USD";
  type?: string;
  isInstallment?: boolean;
  category?: string;
}

const zero = { ars: 0, usd: 0 };

async function seedVisa(rows: TxSeed[]): Promise<void> {
  const statement = await StatementModel.create({
    issuer: "visa_signature", cardLabel: "Visa Signature", last4: "1234", closingDate: new Date("2026-08-26"),
    dueDate: null, totals: { totalConsumos: zero, saldoActual: zero, pagoMinimo: zero, saldoAnterior: zero },
    sourceFileName: "visa.pdf", sourceHash: "visa-2026-08", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.insertMany(rows.map(
    ({ date, merchant, amount, currency = "ARS", type = "purchase", isInstallment = false, category = "Suscripciones" }, index) => ({
      statementId: statement._id, issuer: "visa_signature", cardLabel: "Visa Signature", date: new Date(date),
      descriptionRaw: merchant, merchant, category, categorySource: "rule", amount, currency, direction: "debit",
      type, isInstallment, installmentCurrent: isInstallment ? 1 : null, installmentTotal: isInstallment ? 12 : null,
      comprobante: null, fingerprint: `fp-${index}`,
    }),
  ));
}

const STREAMFLIX_IDS = ["58141049416586488", "ydnBWjd7S", "LYXdQ0WEI5", "77Hq2Kp1"];
const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08"];

const streamflixAndNoise = (): TxSeed[] => MONTHS.flatMap((month, index) => [
  { date: `${month}-09`, merchant: `STREAMFLIX.COM ${STREAMFLIX_IDS[index]}`, amount: 12.99, currency: "USD" as const },
  { date: `${month}-04`, merchant: "MERCADOLIBRE", amount: 15000, isInstallment: true, category: "Compras" },
  { date: `${month}-09`, merchant: "IVA RG 4240 SERV DIGITALES", amount: 2.73, currency: "USD" as const, type: "tax" },
  { date: `${month}-03`, merchant: "CAFE MARTINEZ 12", amount: 4500, category: "Comida" },
  { date: `${month}-12`, merchant: "CAFE MARTINEZ 12", amount: 5200, category: "Comida" },
  { date: `${month}-20`, merchant: "CAFE MARTINEZ 12", amount: 6100, category: "Comida" },
]);

const cafeRosita = (): TxSeed[] => [{ date: "2026-08-15", merchant: "CAFE ROSITA 4471", amount: 3800, category: "Comida" }];

beforeEach(() => {
  vi.mocked(fetchOficialRate).mockResolvedValue(COTIZACION);
});

describe("GET /api/subscriptions", () => {
  it("sin datos responde 200 con la lista vacía y totales en cero", async () => {
    const res = await request(app).get("/api/subscriptions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      cotizacionOficial: COTIZACION, totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0, items: [],
    });
  });

  it("detecta el cobro mensual entre cuotas, impuestos y compras sueltas", async () => {
    await seedVisa(streamflixAndNoise());
    const res = await request(app).get("/api/subscriptions");
    expect(res.status).toBe(200);
    const report = subscriptionsReportDtoSchema.parse(res.body);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({
      key: "STREAMFLIX COM", nombre: "STREAMFLIX.COM", moneda: "USD", montoActual: 12.99,
      montoMensualArs: 19030.35, cobros: 4, estado: "activa", oculta: false, cardLabel: "Visa Signature",
      primerCobro: "2026-05-09", ultimoCobro: "2026-08-09",
    });
    expect(report).toMatchObject({ totalMensualArs: 19030.35, totalMensualUsd: 12.99, totalAnualArs: 228364.2 });
  });

  it("sin cotización deja los pesos de los dólares en null", async () => {
    vi.mocked(fetchOficialRate).mockResolvedValue(null);
    await seedVisa(streamflixAndNoise());
    const res = await request(app).get("/api/subscriptions");
    expect(res.body).toMatchObject({ cotizacionOficial: null, totalMensualArs: 0, totalMensualUsd: 12.99 });
    expect(res.body.items[0].montoMensualArs).toBeNull();
  });
});

describe("ocultar suscripciones", () => {
  it("PUT la oculta, es idempotente y saca sus montos de los totales", async () => {
    await seedVisa(streamflixAndNoise());
    expect((await request(app).put("/api/subscriptions/hidden/STREAMFLIX%20COM")).status).toBe(204);
    expect((await request(app).put("/api/subscriptions/hidden/STREAMFLIX%20COM")).status).toBe(204);
    expect(await HiddenSubscriptionModel.countDocuments()).toBe(1);
    const res = await request(app).get("/api/subscriptions");
    expect(res.body.items[0].oculta).toBe(true);
    expect(res.body).toMatchObject({ totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0 });
  });

  it("DELETE la vuelve a mostrar y también es idempotente", async () => {
    await seedVisa(streamflixAndNoise());
    await request(app).put("/api/subscriptions/hidden/STREAMFLIX%20COM");
    expect((await request(app).delete("/api/subscriptions/hidden/STREAMFLIX%20COM")).status).toBe(204);
    expect((await request(app).delete("/api/subscriptions/hidden/STREAMFLIX%20COM")).status).toBe(204);
    const res = await request(app).get("/api/subscriptions");
    expect(res.body.items[0].oculta).toBe(false);
    expect(res.body.totalMensualUsd).toBe(12.99);
  });

  it.each([
    ["en blanco", "%20%20"],
    ["de más de 60 caracteres", "A".repeat(61)],
  ])("PUT con una clave %s responde 400", async (_label, key) => {
    const res = await request(app).put(`/api/subscriptions/hidden/${key}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Clave inválida" });
  });

  it("guarda la clave recortada", async () => {
    await request(app).put("/api/subscriptions/hidden/%20STREAMFLIX%20COM%20");
    expect((await HiddenSubscriptionModel.findOne().lean())?.key).toBe("STREAMFLIX COM");
  });
});

describe("GET /api/subscriptions con marcas guardadas", () => {
  it("un comercio marcado a mano aparece desde su primer cobro", async () => {
    await seedVisa(cafeRosita());
    expect((await request(app).get("/api/subscriptions")).body.items).toEqual([]);
    await ManualSubscriptionModel.create({ key: "CAFE ROSITA" });
    const report = subscriptionsReportDtoSchema.parse((await request(app).get("/api/subscriptions")).body);
    expect(report.items).toMatchObject([{ key: "CAFE ROSITA", cobros: 1, cadencia: "mensual", estado: "activa" }]);
  });

  it("una marca manual guardada antes de que existieran los cobros marcados sigue forzando el comercio", async () => {
    await seedVisa(cafeRosita());
    await ManualSubscriptionModel.collection.insertOne({ key: "CAFE ROSITA", markedAt: new Date() });
    const res = await request(app).get("/api/subscriptions");
    expect(res.status).toBe(200);
    expect(res.body.items).toMatchObject([{ key: "CAFE ROSITA", cobros: 1 }]);
  });
});

const idOf = async (merchant: string, date: string): Promise<string> => {
  const doc = await TransactionModel.findOne({ merchant, date: new Date(date) }).lean();
  return String(doc?._id);
};

const markTransaction = (body: object) => request(app).post("/api/subscriptions/manual").send(body);

const ridesAndMembership = (): TxSeed[] => [
  { date: "2026-07-04", merchant: "RIDEGO 7001", amount: 3100, category: "Transporte" },
  { date: "2026-07-17", merchant: "RIDEGO 7001", amount: 8200, category: "Transporte" },
  { date: "2026-08-02", merchant: "RIDEGO 7001", amount: 9900, category: "Transporte" },
  { date: "2026-08-04", merchant: "RIDEGO 7001", amount: 3100, category: "Transporte" },
  { date: "2026-08-17", merchant: "RIDEGO 7001", amount: 8200, category: "Transporte" },
];

describe("marcar suscripciones a mano", () => {
  it("POST /manual responde 204 y el comercio aparece con ese movimiento", async () => {
    await seedVisa(cafeRosita());
    const res = await markTransaction({ transactionId: await idOf("CAFE ROSITA 4471", "2026-08-15") });
    expect(res.status).toBe(204);
    const report = subscriptionsReportDtoSchema.parse((await request(app).get("/api/subscriptions")).body);
    expect(report.items).toMatchObject([
      { key: "CAFE ROSITA", cobros: 1, ultimoCobro: "2026-08-15", cadencia: "mensual", estado: "activa", oculta: false },
    ]);
  });

  it("en un comercio con otros gastos, la suscripción sale del movimiento marcado", async () => {
    await seedVisa(ridesAndMembership());
    await markTransaction({ transactionId: await idOf("RIDEGO 7001", "2026-08-02") });
    const report = subscriptionsReportDtoSchema.parse((await request(app).get("/api/subscriptions")).body);
    expect(report.items).toMatchObject([
      { key: "RIDEGO", montoActual: 9900, primerCobro: "2026-08-02", ultimoCobro: "2026-08-02", cobros: 1 },
    ]);
  });

  it("guarda la clave cruda con el cobro marcado y marcar dos veces deja una sola marca", async () => {
    await seedVisa([{ date: "2026-08-09", merchant: "GOOGLE *VideoPremium", amount: 3500 }]);
    const transactionId = await idOf("GOOGLE *VideoPremium", "2026-08-09");
    expect((await markTransaction({ transactionId: `  ${transactionId}  ` })).status).toBe(204);
    expect((await markTransaction({ transactionId })).status).toBe(204);
    const docs = await ManualSubscriptionModel.find().lean();
    expect(docs.map(({ key, cobros }) => ({ key, cobros }))).toEqual([
      { key: "GOOGLE VIDEOPREMIUM", cobros: [{ date: "2026-08-09", amount: 3500, currency: "ARS" }] },
    ]);
  });

  it("marcar otro movimiento del mismo comercio suma su cobro a la marca", async () => {
    await seedVisa(ridesAndMembership());
    await markTransaction({ transactionId: await idOf("RIDEGO 7001", "2026-07-17") });
    await markTransaction({ transactionId: await idOf("RIDEGO 7001", "2026-08-02") });
    const docs = await ManualSubscriptionModel.find().lean();
    expect(docs.map(({ key, cobros }) => ({ key, fechas: cobros.map(({ date }) => date) }))).toEqual([
      { key: "RIDEGO", fechas: ["2026-07-17", "2026-08-02"] },
    ]);
  });

  it.each([
    ["sin movimiento", {}],
    ["con el movimiento en blanco", { transactionId: "   " }],
    ["con un movimiento que no es texto", { transactionId: 42 }],
  ])("POST /manual %s responde 400", async (_label, body) => {
    const res = await markTransaction(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Movimiento inválido" });
  });

  it.each([
    ["un id mal formado", "no-es-un-id"],
    ["un id que no existe", "64b7f0c2a1b2c3d4e5f60718"],
  ])("POST /manual con %s responde 404 y no guarda nada", async (_label, transactionId) => {
    const res = await markTransaction({ transactionId });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Movimiento no encontrado" });
    expect(await ManualSubscriptionModel.countDocuments()).toBe(0);
  });

  it("POST /manual con un comercio sin palabras responde 400 y no guarda nada", async () => {
    await seedVisa([{ date: "2026-08-09", merchant: "123456 7890", amount: 3500 }]);
    const res = await markTransaction({ transactionId: await idOf("123456 7890", "2026-08-09") });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Este comercio no tiene un nombre reconocible" });
    expect(await ManualSubscriptionModel.countDocuments()).toBe(0);
  });

  it("marcar un comercio oculto lo vuelve a mostrar", async () => {
    await seedVisa(cafeRosita());
    await request(app).put("/api/subscriptions/hidden/CAFE%20ROSITA");
    await markTransaction({ transactionId: await idOf("CAFE ROSITA 4471", "2026-08-15") });
    expect(await HiddenSubscriptionModel.countDocuments()).toBe(0);
    const res = await request(app).get("/api/subscriptions");
    expect(res.body.items).toMatchObject([{ key: "CAFE ROSITA", oculta: false }]);
  });
});

const setCadence = (key: string, body: object) => request(app).put(`/api/subscriptions/cadence/${key}`).send(body);

describe("cambiar la cadencia de una suscripción", () => {
  it("PUT anual la pasa a anual, es idempotente y divide por 12", async () => {
    await seedVisa(streamflixAndNoise());
    expect((await setCadence("STREAMFLIX%20COM", { cadencia: "anual" })).status).toBe(204);
    expect((await setCadence("STREAMFLIX%20COM", { cadencia: "anual" })).status).toBe(204);
    expect(await SubscriptionCadenceModel.countDocuments()).toBe(1);
    const report = subscriptionsReportDtoSchema.parse((await request(app).get("/api/subscriptions")).body);
    expect(report.items).toMatchObject([{
      key: "STREAMFLIX COM", cadencia: "anual", cobros: 1, proximoCobro: "2027-08-09", montoMensualArs: 1585.86,
    }]);
    expect(report).toMatchObject({ totalMensualArs: 1585.86, totalMensualUsd: 1.08 });
  });

  it("PUT bimestral la pasa a bimestral y divide por 2", async () => {
    await seedVisa(cafeRosita());
    await ManualSubscriptionModel.create({ key: "CAFE ROSITA" });
    expect((await setCadence("CAFE%20ROSITA", { cadencia: "bimestral" })).status).toBe(204);
    const report = subscriptionsReportDtoSchema.parse((await request(app).get("/api/subscriptions")).body);
    expect(report.items).toMatchObject([{
      key: "CAFE ROSITA", cadencia: "bimestral", cobros: 1, proximoCobro: "2026-10-15", montoMensualArs: 1900,
    }]);
  });

  it("PUT pasa de anual a bimestral sin duplicar la marca", async () => {
    await seedVisa(cafeRosita());
    await setCadence("CAFE%20ROSITA", { cadencia: "anual" });
    await setCadence("CAFE%20ROSITA", { cadencia: "bimestral" });
    expect(await SubscriptionCadenceModel.find().lean()).toMatchObject([{ key: "CAFE ROSITA", cadencia: "bimestral" }]);
  });

  it("PUT mensual borra la marca y también es idempotente", async () => {
    await seedVisa(streamflixAndNoise());
    await setCadence("STREAMFLIX%20COM", { cadencia: "anual" });
    expect((await setCadence("STREAMFLIX%20COM", { cadencia: "mensual" })).status).toBe(204);
    expect((await setCadence("STREAMFLIX%20COM", { cadencia: "mensual" })).status).toBe(204);
    expect(await SubscriptionCadenceModel.countDocuments()).toBe(0);
    const res = await request(app).get("/api/subscriptions");
    expect(res.body.items).toMatchObject([{ cadencia: "mensual", cobros: 4 }]);
    expect(res.body.totalMensualUsd).toBe(12.99);
  });

  it("una marca anual guardada antes de que existiera la cadencia sigue siendo anual", async () => {
    await seedVisa(streamflixAndNoise());
    await SubscriptionCadenceModel.collection.insertOne({ key: "STREAMFLIX COM", annualAt: new Date() });
    const res = await request(app).get("/api/subscriptions");
    expect(res.body.items).toMatchObject([{ key: "STREAMFLIX COM", cadencia: "anual" }]);
  });

  it.each([
    ["en blanco", "%20%20"],
    ["de más de 60 caracteres", "A".repeat(61)],
  ])("PUT /cadence con una clave %s responde 400", async (_label, key) => {
    const res = await setCadence(key, { cadencia: "anual" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Clave inválida" });
  });

  it.each([
    ["sin cadencia", {}],
    ["con una cadencia desconocida", { cadencia: "semanal" }],
  ])("PUT /cadence %s responde 400 y no guarda nada", async (_label, body) => {
    const res = await setCadence("STREAMFLIX%20COM", body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Cadencia inválida" });
    expect(await SubscriptionCadenceModel.countDocuments()).toBe(0);
  });
});
