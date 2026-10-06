import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import request from "supertest";
import { subscriptionsReportDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { HiddenSubscriptionModel, ManualSubscriptionModel, StatementModel, TransactionModel } from "../../db/models.js";
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
});
