import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../../fx/dollarRate.js";
import { withDb } from "../../testing/withDb.js";
import { TEST_AUTH_CONFIG, withAuthedApi } from "../../testing/auth.js";
import { createApp } from "../app.js";

withDb();
const app = createApp(TEST_AUTH_CONFIG);
const auth = withAuthedApi(app);
const mockedFx = vi.mocked(fetchOficialRate);

beforeEach(() => mockedFx.mockReset());

describe("GET /api/fx/oficial", () => {
  it("devuelve la cotización oficial de hoy", async () => {
    mockedFx.mockResolvedValue(1234.5);
    const res = await auth.api.get("/api/fx/oficial");
    expect(res.status).toBe(200);
    expect(res.body.rate).toBe(1234.5);
    expect(res.body.source).toBe("oficial");
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("devuelve rate null si la API falla", async () => {
    mockedFx.mockResolvedValue(null);
    const res = await auth.api.get("/api/fx/oficial");
    expect(res.status).toBe(200);
    expect(res.body.rate).toBeNull();
  });
});
