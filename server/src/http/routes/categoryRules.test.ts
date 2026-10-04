import { describe, it, expect } from "vitest";
import request from "supertest";
import { inboxRuleResultDtoSchema, uncategorizedInboxDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { CategoryRuleModel, MacroSeriesModel, StatementModel, TransactionModel } from "../../db/models.js";

withDb();
const app = createApp();

describe("category-rules CRUD", () => {
  it("crea, lista, edita y borra", async () => {
    const created = await request(app).post("/api/category-rules")
      .send({ priority: 5, matchType: "contains", pattern: "UBER", category: "Transporte" });
    expect(created.status).toBe(201);
    expect(created.body.source).toBe("user");
    const id = created.body.id;

    expect((await request(app).get("/api/category-rules")).body).toHaveLength(1);

    const patched = await request(app).patch(`/api/category-rules/${id}`).send({ enabled: false });
    expect(patched.body.enabled).toBe(false);

    expect((await request(app).delete(`/api/category-rules/${id}`)).status).toBe(204);
  });
});

describe("POST /api/category-rules/apply", () => {
  const seedTx = async () => {
    const s = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "h", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    const base = {
      statementId: s._id, issuer: "icbc" as const, cardLabel: "ICBC", date: new Date(), amount: 100,
      currency: "ARS" as const, direction: "debit" as const, type: "purchase" as const, isInstallment: false,
      installmentCurrent: null, installmentTotal: null,
    };
    await TransactionModel.insertMany([
      { ...base, descriptionRaw: "UBER TRIP", merchant: "UBER TRIP", category: "Sin categoría", categorySource: "rule", comprobante: "1", fingerprint: "f1" },
      { ...base, descriptionRaw: "UBER EATS", merchant: "UBER EATS", category: "Comida", categorySource: "manual", comprobante: "2", fingerprint: "f2" },
      { ...base, descriptionRaw: "REGALO RARO", merchant: "REGALO RARO", category: "Regalos", categorySource: "manual", comprobante: "3", fingerprint: "f3" },
      { ...base, descriptionRaw: "COMERCIO XYZ", merchant: "COMERCIO XYZ", category: "Compras", categorySource: "rule", comprobante: "4", fingerprint: "f4" },
    ]);
  };

  it("pisa las manuales cuando una regla matchea y preserva las manuales sin match", async () => {
    await seedTx();
    await request(app).post("/api/category-rules")
      .send({ priority: 1, matchType: "contains", pattern: "UBER", category: "Transporte" });

    await request(app).post("/api/category-rules/apply");
    expect((await TransactionModel.findOne({ comprobante: "1" }))?.category).toBe("Transporte");
    expect((await TransactionModel.findOne({ comprobante: "2" }))?.category).toBe("Transporte");
    expect((await TransactionModel.findOne({ comprobante: "2" }))?.categorySource).toBe("rule");
    expect((await TransactionModel.findOne({ comprobante: "3" }))?.category).toBe("Regalos");
    expect((await TransactionModel.findOne({ comprobante: "4" }))?.category).toBe("Sin categoría");
  });
});

interface TxSeed {
  merchant: string;
  descriptionRaw?: string;
  amount?: number;
  currency?: "ARS" | "USD";
  type?: "purchase" | "payment" | "tax";
  category?: string;
  categorySource?: "rule" | "manual";
  date?: string;
}

const seedTransactions = async (seeds: TxSeed[]) => {
  const statement = await StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
    sourceFileName: "bandeja.pdf", sourceHash: "bandeja", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.insertMany(seeds.map((seed, position) => ({
    statementId: statement._id, issuer: "icbc", cardLabel: "ICBC",
    date: new Date(`${seed.date ?? "2026-09-10"}T12:00:00Z`),
    descriptionRaw: seed.descriptionRaw ?? seed.merchant, merchant: seed.merchant,
    category: seed.category ?? "Sin categoría", categorySource: seed.categorySource ?? "rule",
    amount: seed.amount ?? 100, currency: seed.currency ?? "ARS", direction: "debit", type: seed.type ?? "purchase",
    isInstallment: false, installmentCurrent: null, installmentTotal: null,
    comprobante: `b${position}`, fingerprint: `bandeja-${position}`,
  })));
};

describe("GET /api/category-rules/inbox", () => {
  it("agrupa solo las compras sin categoría y usa el último dólar oficial", async () => {
    await seedTransactions([
      { merchant: "PANADERIA LA ESPIGA", amount: 1000, date: "2026-09-01" },
      { merchant: "PANADERIA LA ESPIGA", amount: 2000, date: "2026-09-20" },
      { merchant: "STEAMGAMES.COM 4259522985", amount: 10, currency: "USD", date: "2026-09-14" },
      { merchant: "PAGO EN PESOS", type: "payment" },
      { merchant: "IMPUESTO DE SELLOS", type: "tax" },
      { merchant: "KIOSCO EL SOL", category: "Comida" },
      { merchant: "REGALO RARO", category: "Regalos", categorySource: "manual" },
    ]);
    await MacroSeriesModel.create([
      { serie: "usd_oficial", fecha: "2026-09-01", valor: 1300 },
      { serie: "usd_oficial", fecha: "2026-09-30", valor: 1400 },
      { serie: "uva", fecha: "2026-10-01", valor: 1700 },
    ]);

    const res = await request(app).get("/api/category-rules/inbox");

    expect(res.status).toBe(200);
    const inbox = uncategorizedInboxDtoSchema.parse(res.body);
    expect(inbox.pendingCount).toBe(3);
    expect(inbox.usdRate).toBe(1400);
    expect(inbox.groups).toEqual([
      { pattern: "STEAMGAMES.COM", merchants: ["STEAMGAMES.COM 4259522985"], count: 1, totalArs: 0, totalUsd: 10,
        equivalentArs: 14000, lastDate: "2026-09-14" },
      { pattern: "PANADERIA LA ESPIGA", merchants: ["PANADERIA LA ESPIGA"], count: 2, totalArs: 3000, totalUsd: 0,
        equivalentArs: 3000, lastDate: "2026-09-20" },
    ]);
  });

  it("sin dólar oficial cargado devuelve usdRate null", async () => {
    await seedTransactions([{ merchant: "KIOSCO EL SOL" }]);
    const res = await request(app).get("/api/category-rules/inbox");
    expect(res.status).toBe(200);
    expect(res.body.usdRate).toBeNull();
    expect(res.body.pendingCount).toBe(1);
  });
});

describe("POST /api/category-rules/inbox/rules", () => {
  it("crea la regla y categoriza solo los pendientes que coinciden", async () => {
    await seedTransactions([
      { merchant: "PANADERIA LA ESPIGA" },
      { merchant: "PANADERIA LA ESPIGA" },
      { merchant: "PANADERIA LA ESPIGA", type: "tax", descriptionRaw: "PERCEPCION PANADERIA LA ESPIGA" },
      { merchant: "PANADERIA LA ESPIGA", category: "Supermercado" },
      { merchant: "PANADERIA LA ESPIGA", category: "Regalos", categorySource: "manual" },
      { merchant: "KIOSCO EL SOL" },
    ]);

    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: "PANADERIA LA", category: "Comida" });

    expect(res.status).toBe(201);
    const result = inboxRuleResultDtoSchema.parse(res.body);
    expect(result.categorized).toBe(3);
    expect(result.rule).toMatchObject({ priority: 100, matchType: "contains", pattern: "PANADERIA LA", category: "Comida", source: "user", enabled: true });
    expect(await CategoryRuleModel.countDocuments()).toBe(1);
    expect(await TransactionModel.countDocuments({ category: "Comida", categorySource: "rule" })).toBe(3);
    expect(await TransactionModel.countDocuments({ category: "Supermercado" })).toBe(1);
    expect(await TransactionModel.countDocuments({ category: "Regalos", categorySource: "manual" })).toBe(1);
    expect(await TransactionModel.countDocuments({ category: "Sin categoría" })).toBe(1);
  });

  it("recorta patrón y categoría", async () => {
    await seedTransactions([{ merchant: "KIOSCO EL SOL" }]);
    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: "  kiosco el  ", category: " Comida " });
    expect(res.status).toBe(201);
    expect(res.body.rule).toMatchObject({ pattern: "kiosco el", category: "Comida" });
    expect(res.body.categorized).toBe(1);
  });

  it("si la regla no coincide con ningún pendiente responde 201 con 0", async () => {
    await seedTransactions([{ merchant: "KIOSCO EL SOL" }]);
    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: "FARMACIA", category: "Salud" });
    expect(res.status).toBe(201);
    expect(res.body.categorized).toBe(0);
    expect(await CategoryRuleModel.countDocuments()).toBe(1);
  });

  it("rechaza un patrón de menos de 3 caracteres sin crear la regla", async () => {
    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: " ab ", category: "Comida" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("El patrón tiene que tener al menos 3 caracteres");
    expect(await CategoryRuleModel.countDocuments()).toBe(0);
  });

  it.each([[""], ["Sin categoría"], [undefined]])("rechaza la categoría «%s» sin crear la regla", async (category) => {
    const res = await request(app).post("/api/category-rules/inbox/rules").send({ pattern: "PANADERIA", category });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Elegí una categoría");
    expect(await CategoryRuleModel.countDocuments()).toBe(0);
  });
});
