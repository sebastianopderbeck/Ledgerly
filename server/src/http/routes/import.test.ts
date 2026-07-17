import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";

vi.mock("../../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
import { extractPdfText } from "../../pdf/extract.js";
import { createApp } from "../app.js";

withDb();
const app = createApp();
const mocked = vi.mocked(extractPdfText);
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const couponText = read("../../parsers/__fixtures__/icbc-mortgage.sample.txt");
const statementText = read("../../parsers/__fixtures__/icbc.sample.txt");

describe("POST /api/import", () => {
  it("importa un cupón (kind coupon, 201)", async () => {
    mocked.mockResolvedValue({ text: couponText, meta });
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "c.pdf");
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("coupon");
    expect(res.body.coupon.cuotaNro).toBe(1);
  });

  it("reimportar el mismo cupón devuelve duplicate (200)", async () => {
    mocked.mockResolvedValue({ text: couponText, meta });
    await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "c.pdf");
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "c.pdf");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("duplicate");
  });

  it("importa un extracto (kind statement, 201)", async () => {
    mocked.mockResolvedValue({ text: statementText, meta });
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "s.pdf");
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("statement");
    expect(res.body.transactionCount).toBeGreaterThan(0);
  });

  it("documento no reconocido → 422", async () => {
    mocked.mockResolvedValue({ text: "documento cualquiera sin marcadores conocidos", meta });
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "x.pdf");
    expect(res.status).toBe(422);
  });

  it("sin archivo → 400", async () => {
    const res = await request(app).post("/api/import");
    expect(res.status).toBe(400);
  });
});
