import { Types } from "mongoose";
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";
import { seedCoupons } from "./seedCoupons.js";
import { MortgageCouponModel } from "../db/models.js";

const USER_ID = new Types.ObjectId();

const dir = fileURLToPath(new URL("../../../examples/credito/", import.meta.url));
const hasReal = existsSync(dir);

withDb();

describe.skipIf(!hasReal)("seedCoupons", () => {
  it("importa los 11 cupones de ejemplo", async () => {
    const r = await seedCoupons(dir, USER_ID);
    expect(r.imported).toBe(11);
    expect(await MortgageCouponModel.countDocuments({ userId: USER_ID })).toBe(11);
  }, 30000);

  it("es idempotente (segunda corrida = duplicados)", async () => {
    await seedCoupons(dir, USER_ID);
    const r = await seedCoupons(dir, USER_ID);
    expect(r.duplicates).toBe(11);
    expect(await MortgageCouponModel.countDocuments({ userId: USER_ID })).toBe(11);
  }, 30000);
});
