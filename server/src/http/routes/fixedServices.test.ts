import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { fixedServiceDtoSchema, type FixedServiceDTO } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { FixedServiceModel } from "../../db/models.js";

withDb();
const app = createApp();

const INVALID = "Servicio inválido";
const NOT_FOUND = "Servicio no encontrado";
const MISSING_ID = "66f000000000000000000000";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const create = (body: object) => request(app).post("/api/fixed-services").send(body);
const patch = (id: string, body: object) => request(app).patch(`/api/fixed-services/${id}`).send(body);
const created = async (body: object = { nombre: "Luz", monto: 30_000 }): Promise<FixedServiceDTO> =>
  fixedServiceDtoSchema.parse((await create(body)).body);

describe("POST /api/fixed-services", () => {
  it("crea un servicio mensual desde el mes actual", async () => {
    const res = await create({ nombre: " Luz ", monto: 30_000 });
    expect(res.status).toBe(201);
    expect(fixedServiceDtoSchema.parse(res.body)).toEqual({
      id: expect.any(String), nombre: "Luz", monto: 30_000, cadencia: "mensual",
      desde: "2026-10", hasta: null, montoDesde: "2026-10",
    });
  });

  it("respeta la cadencia y el mes desde, y montoDesde es el mes actual", async () => {
    expect(await created({ nombre: "Gas", monto: 18_000, cadencia: "bimestral", desde: "2026-11" }))
      .toMatchObject({ cadencia: "bimestral", desde: "2026-11", montoDesde: "2026-10" });
  });

  it("crea un servicio anual", async () => {
    expect(await created({ nombre: "ABL", monto: 120_000, cadencia: "anual", desde: "2027-01" }))
      .toMatchObject({ cadencia: "anual", desde: "2027-01", monto: 120_000 });
  });

  it.each([
    ["sin nombre", { nombre: "", monto: 100 }],
    ["con monto 0", { nombre: "Luz", monto: 0 }],
    ["con un mes inválido", { nombre: "Luz", monto: 100, desde: "2026-13" }],
    ["con montoDesde", { nombre: "Luz", monto: 100, montoDesde: "2026-01" }],
  ])("rechaza un alta %s", async (_label, body) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: INVALID });
  });
});

describe("GET /api/fixed-services", () => {
  it("lista primero los activos y después los dados de baja, por nombre", async () => {
    const internet = await created({ nombre: "Internet", monto: 25_000 });
    await created({ nombre: "Agua", monto: 9_000 });
    const cable = await created({ nombre: "Cable", monto: 15_000, desde: "2026-01" });
    await patch(cable.id, { hasta: "2026-09" });
    await patch(internet.id, { hasta: "2026-10" });
    const res = await request(app).get("/api/fixed-services");
    expect(res.status).toBe(200);
    expect((res.body as FixedServiceDTO[]).map((servicio) => servicio.nombre)).toEqual(["Agua", "Internet", "Cable"]);
  });

  it("un documento viejo sin cadencia ni hasta se lee con los defaults", async () => {
    await FixedServiceModel.collection.insertOne({ nombre: "Luz", monto: 30_000, desde: "2026-10", montoDesde: "2026-10" });
    const [servicio] = (await request(app).get("/api/fixed-services")).body as FixedServiceDTO[];
    expect(servicio).toMatchObject({ nombre: "Luz", cadencia: "mensual", hasta: null });
  });
});

describe("PATCH /api/fixed-services/:id", () => {
  it("cambiar el monto mueve montoDesde al mes actual", async () => {
    const luz = await created();
    vi.setSystemTime(new Date("2026-12-05T12:00:00Z"));
    const res = await patch(luz.id, { monto: 36_000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ monto: 36_000, montoDesde: "2026-12" });
  });

  it("cambiar otros campos, o mandar el mismo monto, no mueve montoDesde", async () => {
    const luz = await created();
    vi.setSystemTime(new Date("2026-12-05T12:00:00Z"));
    const res = await patch(luz.id, { nombre: "Electricidad", monto: 30_000, cadencia: "bimestral" });
    expect(res.body).toMatchObject({ nombre: "Electricidad", cadencia: "bimestral", montoDesde: "2026-10" });
  });

  it("da de baja con hasta y lo reactiva con null", async () => {
    const luz = await created();
    expect((await patch(luz.id, { hasta: "2026-11" })).body).toMatchObject({ hasta: "2026-11" });
    expect((await patch(luz.id, { hasta: null })).body).toMatchObject({ hasta: null });
  });

  it("rechaza un hasta anterior al desde, también combinando con lo guardado", async () => {
    const gas = await created({ nombre: "Gas", monto: 18_000, desde: "2026-10" });
    expect((await patch(gas.id, { hasta: "2026-09" })).status).toBe(400);
    expect((await patch(gas.id, { desde: "2026-12", hasta: "2026-11" })).status).toBe(400);
    await patch(gas.id, { hasta: "2026-11" });
    const res = await patch(gas.id, { desde: "2026-12" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: INVALID });
  });

  it("rechaza campos de más", async () => {
    const luz = await created();
    expect((await patch(luz.id, { montoDesde: "2026-01" })).status).toBe(400);
  });

  it.each([MISSING_ID, "no-es-un-id"])("responde 404 con el id %s", async (id) => {
    const res = await patch(id, { monto: 1 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: NOT_FOUND });
  });
});

describe("DELETE /api/fixed-services/:id", () => {
  it("borra el servicio", async () => {
    const luz = await created();
    expect((await request(app).delete(`/api/fixed-services/${luz.id}`)).status).toBe(204);
    expect(await FixedServiceModel.countDocuments()).toBe(0);
  });

  it("responde 404 con un id inexistente", async () => {
    const res = await request(app).delete(`/api/fixed-services/${MISSING_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: NOT_FOUND });
  });
});
