import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { cashFlowDtoSchema, type CashFlowDTO } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import {
  AutoCouponModel, MacroSeriesModel, MortgageCouponModel, PayslipModel, StatementModel, TransactionModel,
} from "../../db/models.js";

withDb();
const app = createApp();

const money = (ars: number, usd = 0) => ({ ars, usd });

const visa = (closing: string, due: string, saldo: number, usd = 0) => ({
  issuer: "visa_signature",
  cardLabel: "Visa Signature",
  last4: "0000",
  closingDate: new Date(closing),
  dueDate: new Date(due),
  totals: { totalConsumos: money(saldo, usd), saldoActual: money(saldo, usd), pagoMinimo: money(0), saldoAnterior: money(0) },
  sourceFileName: `visa-${closing}.pdf`,
  sourceHash: `visa-${closing}`,
  pageCount: 1,
  parserVersion: "1",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
});

const recibo = (periodo: string, fechaPago: string, neto: number) => ({
  periodo,
  tipo: "mensual",
  fechaPago: new Date(fechaPago),
  cuil: "20-00000000-0",
  remunerativo: neto,
  noRemunerativo: 0,
  descuentos: 0,
  brutoTotal: neto,
  neto,
  sourceFileName: `recibo-${periodo}.pdf`,
  sourceHash: `recibo-${periodo}`,
});

const seed = async () => {
  await PayslipModel.create([recibo("2026-08", "2026-08-31", 1_000_000), recibo("2026-09", "2026-09-30", 1_100_000)]);
  const statements = await StatementModel.create([
    visa("2026-07-31", "2026-08-11", 400_000),
    visa("2026-08-28", "2026-09-09", 450_000, 20),
    visa("2026-10-02", "2026-10-13", 500_000),
  ]);
  await TransactionModel.create({
    statementId: statements[2]._id, issuer: "visa_signature", cardLabel: "Visa Signature", date: new Date("2026-08-20"),
    descriptionRaw: "COMERCIO EN CUOTAS", merchant: "COMERCIO", category: "Hogar", categorySource: "rule",
    amount: 30_000, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
    installmentCurrent: 2, installmentTotal: 4, comprobante: "1", fingerprint: "cuota-1",
  });
  await MacroSeriesModel.create({ serie: "usd_oficial", fecha: "2026-09-08", valor: 1_400 });
  await MortgageCouponModel.create({
    prestamoNro: "0000000001", cuotaNro: 12, fechaDebito: new Date("2026-09-17"), capital: 100_000, intereses: 200_000,
    seguroIncendio: 0, totalDebitado: 300_000, cuotaPuraUva: 300, cotizacionUva: 1_000, tea: 12.68, tna: 12, cft: 0,
    sourceFileName: "cupon-12.pdf", sourceHash: "cupon-12",
  });
  await AutoCouponModel.create({
    grupo: "1000", orden: "1", cuotaNro: 20, plan: "X", fechaEmision: new Date("2026-08-20"),
    fechaVencimiento: new Date("2026-09-10"), comprobante: "1", modelo: "AUTO DE PRUEBA", valorMovil: 20_000_000,
    conceptos: [], totalAPagar: 150_000, sourceFileName: "auto-20.pdf", sourceHash: "auto-20",
  });
};

const mesDe = (flow: CashFlowDTO, mes: string) => flow.meses.find((item) => item.mes === mes);

describe("GET /api/cash-flow", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("con la base vacía no hay flujo", async () => {
    const res = await request(app).get("/api/cash-flow");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mesActual: "2026-10", meses: [] });
  });

  it("arma la historia y la proyección desde los documentos importados", async () => {
    await seed();
    const res = await request(app).get("/api/cash-flow");
    expect(res.status).toBe(200);
    const flow = cashFlowDtoSchema.parse(res.body);
    expect(flow.mesActual).toBe("2026-10");
    expect(flow.meses.map((mes) => mes.mes)).toEqual([
      "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]);
    expect(mesDe(flow, "2026-09")).toMatchObject({
      estado: "completo", ingreso: 1_100_000, tarjetas: 478_000, hipoteca: 300_000, auto: 150_000, margen: 172_000,
    });
    expect(mesDe(flow, "2026-10")).toMatchObject({ estado: "en_curso", tarjetas: 500_000, hipoteca: 300_000, auto: 150_000 });
    expect(mesDe(flow, "2026-11")?.tarjetas).toBe(30_000);
    expect(mesDe(flow, "2026-12")?.tarjetas).toBe(30_000);
    expect(mesDe(flow, "2027-01")?.tarjetas).toBe(0);
    expect(mesDe(flow, "2026-11")?.estimados).toContain("Visa Signature (solo cuotas)");
  });
});
