import { describe, it, expect, vi } from "vitest";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/inflationRate.js", () => ({ fetchInflationSeries: vi.fn() }));
import { fetchInflationSeries } from "../fx/inflationRate.js";
import { backfillInflation } from "./backfillInflation.js";
import { InflationRateModel } from "../db/models.js";

withDb();
const mocked = vi.mocked(fetchInflationSeries);

describe("backfillInflation", () => {
  it("hace upsert de la serie ordenada", async () => {
    mocked.mockResolvedValue([
      { periodo: "2025-01", variacionMensual: 2.2 },
      { periodo: "2025-02", variacionMensual: 2.4 },
    ]);
    const r = await backfillInflation();
    expect(r.upserted).toBe(2);
    const docs = await InflationRateModel.find().sort({ periodo: 1 }).lean();
    expect(docs.map((d) => d.periodo)).toEqual(["2025-01", "2025-02"]);
    expect(docs[0].variacionMensual).toBe(2.2);
  });

  it("es idempotente y actualiza el valor por período", async () => {
    mocked.mockResolvedValue([{ periodo: "2025-01", variacionMensual: 2.2 }]);
    await backfillInflation();
    mocked.mockResolvedValue([{ periodo: "2025-01", variacionMensual: 3.0 }]);
    await backfillInflation();
    const docs = await InflationRateModel.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].variacionMensual).toBe(3.0);
  });
});
