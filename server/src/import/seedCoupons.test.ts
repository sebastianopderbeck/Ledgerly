import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";
import { seedCoupons } from "./seedCoupons.js";
import { MortgageCouponModel } from "../db/models.js";

const dir = fileURLToPath(new URL("../../../examples/credito/", import.meta.url));

withDb();

describe("seedCoupons", () => {
  it("importa los 11 cupones de ejemplo", async () => {
    const r = await seedCoupons(dir);
    expect(r.imported).toBe(11);
    expect(await MortgageCouponModel.countDocuments()).toBe(11);
  }, 30000);

  it("es idempotente (segunda corrida = duplicados)", async () => {
    await seedCoupons(dir);
    const r = await seedCoupons(dir);
    expect(r.duplicates).toBe(11);
    expect(await MortgageCouponModel.countDocuments()).toBe(11);
  }, 30000);
});
