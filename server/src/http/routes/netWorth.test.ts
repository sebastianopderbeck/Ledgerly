import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import request from "supertest";
import { netWorthDtoSchema, type ManualAssetDTO } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { AutoCouponModel, MacroSeriesModel, ManualAssetModel, StatementModel, TransactionModel } from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";

withDb();
const app = createApp();

const NO_USD = "No hay cotización del dólar oficial. Actualizá los datos con el botón de la barra superior.";
const INVALID = "Datos del activo inválidos";
const MISSING_ID = "66f000000000000000000000";
const AHORROS = { nombre: "Ahorros", tipo: "ahorro", moneda: "USD", valuacion: { fecha: "2026-10-01", monto: 5000 } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  vi.mocked(fetchOficialRate).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const createAsset = (body: object) => request(app).post("/api/net-worth/assets").send(body);
const patchAsset = (id: string, body: object) => request(app).patch(`/api/net-worth/assets/${id}`).send(body);
const createdAhorros = async (): Promise<ManualAssetDTO> => (await createAsset(AHORROS)).body as ManualAssetDTO;

const createAutoCoupon = (cuotaNro: number, fechaEmision: string, valorMovil: number) =>
  AutoCouponModel.create({
    grupo: "1000", orden: "1", cuotaNro, plan: "A", fechaEmision: new Date(fechaEmision),
    fechaVencimiento: new Date(fechaEmision), comprobante: `C-${cuotaNro}`, modelo: "MODELO X", valorMovil,
    conceptos: [], totalAPagar: 100_000, sourceFileName: `auto-${cuotaNro}.pdf`, sourceHash: `auto-${cuotaNro}`,
  });

const createStatementWithInstallment = async () => {
  const statement = await StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-09-25"), dueDate: null,
    totals: {
      totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 },
    },
    sourceFileName: "resumen.pdf", sourceHash: "resumen", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.create({
    statementId: statement._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-08-10"),
    descriptionRaw: "TIENDA", merchant: "TIENDA", category: "Hogar", categorySource: "rule", amount: 10_000,
    currency: "ARS", direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 3,
    installmentTotal: 6, comprobante: "1", fingerprint: "f1",
  });
};

describe("GET /api/net-worth", () => {
  it("sin nada responde 204 sin pedir el dólar", async () => {
    const res = await request(app).get("/api/net-worth");
    expect(res.status).toBe(204);
    expect(fetchOficialRate).not.toHaveBeenCalled();
  });

  it("arma la foto y la evolución con lo importado y lo cargado a mano", async () => {
    await createAutoCoupon(30, "2026-09-18", 12_000_000);
    await createStatementWithInstallment();
    await createAsset(AHORROS);
    await MacroSeriesModel.insertMany([
      { serie: "usd_oficial", fecha: "2026-09-15", valor: 950 },
      { serie: "usd_oficial", fecha: "2026-10-02", valor: 1000 },
      { serie: "uva", fecha: "2026-10-03", valor: 2000 },
    ]);
    const res = await request(app).get("/api/net-worth");
    expect(res.status).toBe(200);
    const dto = netWorthDtoSchema.parse(res.body);
    expect(dto).toMatchObject({ fecha: "2026-10-03", usdOficial: 1000, usdOficialFecha: "2026-10-02", uva: null, uvaFecha: null });
    expect(dto.items.map((item) => item.fuente)).toEqual(["auto", "manual", "plan_auto", "tarjeta"]);
    expect(dto.totales.netoArs).toBe(12_000_000 + 5_000_000 - 9_000_000 - 30_000);
    expect(dto.evolucion.map((mes) => mes.periodo)).toEqual(["2026-09", "2026-10"]);
    expect(dto.evolucion[1]).toMatchObject(dto.totales);
    expect(dto.activosManuales).toEqual([
      expect.objectContaining({ nombre: "Ahorros", valuaciones: [{ fecha: "2026-10-01", monto: 5000 }] }),
    ]);
    expect(fetchOficialRate).not.toHaveBeenCalled();
  });

  it("sin dólar en la serie lo pide para hoy", async () => {
    await createAsset(AHORROS);
    vi.mocked(fetchOficialRate).mockResolvedValue(1200);
    const res = await request(app).get("/api/net-worth");
    expect(fetchOficialRate).toHaveBeenCalledWith("2026-10-03");
    expect(res.body).toMatchObject({ usdOficial: 1200, usdOficialFecha: "2026-10-03" });
  });

  it("sin dólar en ningún lado responde 503 con el mensaje", async () => {
    await createAsset(AHORROS);
    vi.mocked(fetchOficialRate).mockResolvedValue(null);
    const res = await request(app).get("/api/net-worth");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe(NO_USD);
  });
});

describe("POST /api/net-worth/assets", () => {
  it("crea el activo con su primera valuación y el nombre recortado", async () => {
    const res = await createAsset({ ...AHORROS, nombre: "  Ahorros  " });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String), nombre: "Ahorros", tipo: "ahorro", moneda: "USD",
      valuaciones: [{ fecha: "2026-10-01", monto: 5000 }],
    });
    expect(await ManualAssetModel.countDocuments()).toBe(1);
  });

  it.each([
    ["nombre en blanco", { ...AHORROS, nombre: "   " }, INVALID],
    ["tipo inválido", { ...AHORROS, tipo: "cripto" }, INVALID],
    ["monto negativo", { ...AHORROS, valuacion: { fecha: "2026-10-01", monto: -1 } }, INVALID],
    ["fecha inválida", { ...AHORROS, valuacion: { fecha: "2026-02-30", monto: 1 } }, INVALID],
    ["fecha futura", { ...AHORROS, valuacion: { fecha: "2026-10-04", monto: 1 } }, "La fecha de valuación no puede ser futura"],
  ])("rechaza %s con 400", async (_caso, body, mensaje) => {
    const res = await createAsset(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(mensaje);
    expect(await ManualAssetModel.countDocuments()).toBe(0);
  });
});

describe("PATCH /api/net-worth/assets/:id", () => {
  it("cambia nombre y tipo", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { nombre: "Dólares", tipo: "inversion" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, nombre: "Dólares", tipo: "inversion", moneda: "USD" });
  });

  it("agrega una valuación con fecha nueva en orden", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { valuacion: { fecha: "2026-09-01", monto: 4000 } });
    expect(res.body.valuaciones).toEqual([{ fecha: "2026-09-01", monto: 4000 }, { fecha: "2026-10-01", monto: 5000 }]);
  });

  it("con la fecha de una existente la reemplaza", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { valuacion: { fecha: "2026-10-01", monto: 5500 } });
    expect(res.body.valuaciones).toEqual([{ fecha: "2026-10-01", monto: 5500 }]);
  });

  it("con body vacío no cambia nada", async () => {
    const created = await createdAhorros();
    const res = await patchAsset(created.id, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it("no deja cambiar la moneda", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { moneda: "ARS" });
    expect(res.status).toBe(400);
    expect((await ManualAssetModel.findById(id))?.moneda).toBe("USD");
  });

  it("rechaza una fecha futura", async () => {
    const { id } = await createdAhorros();
    const res = await patchAsset(id, { valuacion: { fecha: "2026-10-04", monto: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("La fecha de valuación no puede ser futura");
  });

  it("con un id inexistente o mal formado responde 404", async () => {
    expect((await patchAsset(MISSING_ID, { nombre: "X" })).status).toBe(404);
    const malformed = await patchAsset("no-es-un-id", { nombre: "X" });
    expect(malformed.status).toBe(404);
    expect(malformed.body.error).toBe("Activo no encontrado");
  });
});

describe("DELETE /api/net-worth/assets/:id", () => {
  it("borra el activo y deja de aparecer", async () => {
    const { id } = await createdAhorros();
    expect((await request(app).delete(`/api/net-worth/assets/${id}`)).status).toBe(204);
    expect(await ManualAssetModel.countDocuments()).toBe(0);
    expect((await request(app).get("/api/net-worth")).status).toBe(204);
  });

  it("con un id que no existe responde 204 igual", async () => {
    expect((await request(app).delete(`/api/net-worth/assets/${MISSING_ID}`)).status).toBe(204);
    expect((await request(app).delete("/api/net-worth/assets/no-es-un-id")).status).toBe(204);
  });
});

describe("DELETE /api/net-worth/assets/:id/valuations/:fecha", () => {
  const withTwoValuations = async (): Promise<string> => {
    const { id } = await createdAhorros();
    await patchAsset(id, { valuacion: { fecha: "2026-09-01", monto: 4000 } });
    return id;
  };

  it("borra esa valuación", async () => {
    const id = await withTwoValuations();
    const res = await request(app).delete(`/api/net-worth/assets/${id}/valuations/2026-09-01`);
    expect(res.status).toBe(200);
    expect(res.body.valuaciones).toEqual([{ fecha: "2026-10-01", monto: 5000 }]);
  });

  it("no deja borrar la única", async () => {
    const { id } = await createdAhorros();
    const res = await request(app).delete(`/api/net-worth/assets/${id}/valuations/2026-10-01`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("No se puede borrar la única valuación: borrá el activo");
  });

  it("con una fecha que no existe responde 404", async () => {
    const id = await withTwoValuations();
    const res = await request(app).delete(`/api/net-worth/assets/${id}/valuations/2026-08-01`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Valuación no encontrada");
  });

  it("con un activo inexistente o mal formado responde 404", async () => {
    expect((await request(app).delete(`/api/net-worth/assets/${MISSING_ID}/valuations/2026-10-01`)).status).toBe(404);
    expect((await request(app).delete("/api/net-worth/assets/x/valuations/2026-10-01")).status).toBe(404);
  });
});
