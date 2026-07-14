import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import type { ParsedStatement } from "@ledgerly/shared";

vi.mock("../../ingestion/parseStatement.js", () => ({ parseStatement: vi.fn() }));
import { parseStatement } from "../../ingestion/parseStatement.js";
import { createApp } from "../app.js";
import { NoTextError } from "../../ingestion/errors.js";

withDb();
const app = createApp();
const mocked = vi.mocked(parseStatement);

const parsed: ParsedStatement = {
  header: { issuer: "visa_signature", cardLabel: "Visa ****1234", last4: "1234",
    closingDate: "2026-07-02", dueDate: "2026-07-13",
    totals: { totalConsumos: { ars: 3700, usd: 50 }, saldoActual: { ars: 3910, usd: 50 },
      pagoMinimo: { ars: 500, usd: 0 }, saldoAnterior: { ars: 1000, usd: 10 } } },
  rows: [{ date: "2026-06-10", descriptionRaw: "COMERCIO UNO", merchant: "COMERCIO UNO", amount: 2500,
    currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
    installmentCurrent: null, installmentTotal: null, comprobante: "111111" }],
};

beforeEach(() => {
  mocked.mockResolvedValue({ statement: parsed, reconciliation: { ok: true, entries: [] },
    meta: { producer: null, creator: null, pageCount: 2, encrypted: false } });
});

describe("POST /api/statements", () => {
  it("importa un PDF y devuelve 201", async () => {
    const res = await request(app).post("/api/statements").attach("file", Buffer.from("pdf"), "r.pdf");
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("imported");
    expect(res.body.statement.cardLabel).toBe("Visa ****1234");
    expect(res.body.transactionCount).toBe(1);
  });

  it("reimportar devuelve 200 duplicate", async () => {
    await request(app).post("/api/statements").attach("file", Buffer.from("pdf"), "r.pdf");
    const res = await request(app).post("/api/statements").attach("file", Buffer.from("pdf"), "r.pdf");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("duplicate");
  });

  it("error de parseo → 422", async () => {
    mocked.mockRejectedValueOnce(new NoTextError());
    const res = await request(app).post("/api/statements").attach("file", Buffer.from("x"), "x.pdf");
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/texto/i);
  });

  it("sin archivo → 400", async () => {
    const res = await request(app).post("/api/statements");
    expect(res.status).toBe(400);
  });
});

describe("GET/DELETE /api/statements", () => {
  it("lista y borra", async () => {
    await request(app).post("/api/statements").attach("file", Buffer.from("pdf"), "r.pdf");
    const list = await request(app).get("/api/statements");
    expect(list.body).toHaveLength(1);
    const id = list.body[0].id;

    const one = await request(app).get(`/api/statements/${id}`);
    expect(one.body.transactions).toHaveLength(1);

    const del = await request(app).delete(`/api/statements/${id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get("/api/statements")).body).toHaveLength(0);
  });
});
