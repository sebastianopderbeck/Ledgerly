import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn(async () => 1000) }));
import { seedAutoCoupons } from "./seedAutoCoupons.js";
import { AutoCouponModel } from "../db/models.js";

withDb();
const dir = fileURLToPath(new URL("../../../examples/auto/", import.meta.url));
const hasReal = existsSync(dir);

describe.skipIf(!hasReal)("seedAutoCoupons", () => {
  it("importa los cupones reales y deduplica en la segunda pasada", async () => {
    const first = await seedAutoCoupons(dir);
    expect(first.imported).toBeGreaterThanOrEqual(1);
    expect(await AutoCouponModel.countDocuments()).toBe(first.imported);
    const second = await seedAutoCoupons(dir);
    expect(second.duplicates).toBeGreaterThanOrEqual(1);
    expect(second.imported).toBe(0);
  }, 30000);
});
