import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
import { extractPdfText } from "../pdf/extract.js";
import { withDb } from "../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OTHER_EMAIL, TEST_OWNER_EMAIL, withAuthedApi, type AuthedSession } from "../testing/auth.js";
import { OWNER_ONLY } from "../auth/requireUser.js";
import { createApp } from "./app.js";

withDb();
const app = createApp(TEST_AUTH_CONFIG);
const ana = withAuthedApi(app, TEST_OWNER_EMAIL);
const beto = withAuthedApi(app, TEST_OTHER_EMAIL);

const statementText = readFileSync(
  fileURLToPath(new URL("../parsers/__fixtures__/icbc.sample.txt", import.meta.url)), "utf8",
);
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };

const importStatement = async (session: AuthedSession) => {
  vi.mocked(extractPdfText).mockResolvedValue({ text: statementText, meta });
  return session.api.post("/api/import").attach("file", Buffer.from("mismo-pdf"), "resumen.pdf");
};

describe("aislamiento entre usuarios", () => {
  it("los dos importan el mismo PDF y cada uno queda imported", async () => {
    const first = await importStatement(ana);
    const second = await importStatement(beto);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.status).toBe("imported");
  });

  it("B no ve ni toca los resúmenes y movimientos de A", async () => {
    const imported = await importStatement(ana);
    const statementId = imported.body.statement.id;
    const anaTxs = (await ana.api.get("/api/transactions")).body;
    const txId = anaTxs.items[0].id;

    expect((await beto.api.get("/api/statements")).body).toEqual([]);
    expect((await beto.api.get(`/api/statements/${statementId}`)).status).toBe(404);
    expect((await beto.api.get(`/api/statements/${statementId}/review`)).status).toBe(404);
    expect((await beto.api.delete(`/api/imports/statement/${statementId}`)).status).toBe(404);
    await beto.api.delete(`/api/statements/${statementId}`);
    expect((await beto.api.get("/api/transactions")).body.total).toBe(0);
    expect((await beto.api.patch(`/api/transactions/${txId}`).send({ category: "Otros" })).status).toBe(404);
    expect((await beto.api.post("/api/transactions/delete").send({ ids: [txId] })).body).toEqual({ deleted: 0 });
    expect((await beto.api.get("/api/stats/summary")).body).toMatchObject({ transactionCount: 0, statementCount: 0 });
    expect((await beto.api.get("/api/imports")).body).toEqual([]);

    expect((await ana.api.get(`/api/statements/${statementId}`)).status).toBe(200);
    expect((await ana.api.get("/api/transactions")).body.total).toBe(anaTxs.total);
  });

  it("presupuestos, servicios, activos y reglas son de cada uno", async () => {
    const budget = (await ana.api.post("/api/budgets").send({ category: "Comida", topeArs: 300000 })).body;
    const service = (await ana.api.post("/api/fixed-services").send({ nombre: "Luz", monto: 1000 })).body;
    const asset = (await ana.api.post("/api/net-worth/assets").send({
      nombre: "Caja", tipo: "cuenta", moneda: "ARS", valuacion: { fecha: "2026-10-01", monto: 1000 },
    })).body;
    const rule = (await ana.api.post("/api/category-rules").send({ pattern: "TIENDA", category: "Compras" })).body;

    expect((await beto.api.get("/api/budgets")).body).toEqual([]);
    expect((await beto.api.get("/api/fixed-services")).body).toEqual([]);
    expect((await beto.api.get("/api/category-rules")).body.map((r: { id: string }) => r.id)).not.toContain(rule.id);

    expect((await beto.api.patch(`/api/budgets/${budget.id}`).send({ topeArs: 1 })).status).toBe(404);
    expect((await beto.api.delete(`/api/budgets/${budget.id}`)).status).toBe(404);
    expect((await beto.api.patch(`/api/fixed-services/${service.id}`).send({ monto: 1 })).status).toBe(404);
    expect((await beto.api.delete(`/api/fixed-services/${service.id}`)).status).toBe(404);
    expect((await beto.api.patch(`/api/net-worth/assets/${asset.id}`).send({ nombre: "X" })).status).toBe(404);
    expect((await beto.api.patch(`/api/category-rules/${rule.id}`).send({ category: "Otros" })).status).toBe(404);

    expect((await beto.api.post("/api/budgets").send({ category: "Comida", topeArs: 1000 })).status).toBe(201);
    expect((await ana.api.get("/api/budgets")).body).toEqual([budget]);
  });

  it("las suscripciones ocultas de uno no chocan con las del otro", async () => {
    expect((await ana.api.put("/api/subscriptions/hidden/netflix")).status).toBe(204);
    expect((await beto.api.put("/api/subscriptions/hidden/netflix")).status).toBe(204);
  });

  it("solo el owner usa los mails", async () => {
    expect((await beto.api.get("/api/mail/status")).body).toEqual({ error: OWNER_ONLY });
    expect((await beto.api.post("/api/mail/gmail/sync")).status).toBe(403);
  });
});
