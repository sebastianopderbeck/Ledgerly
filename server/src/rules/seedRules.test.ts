import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { withDb } from "../testing/withDb.js";
import { CategoryRuleModel } from "../db/models.js";
import { SEED_RULES } from "./categorize.js";
import { seedCategoryRules } from "./seedRules.js";

withDb();

const ANA = new Types.ObjectId();
const BETO = new Types.ObjectId();

describe("seedCategoryRules", () => {
  it("siembra las reglas del sistema para el usuario", async () => {
    expect(await seedCategoryRules(ANA)).toBe(SEED_RULES.length);
    expect(await CategoryRuleModel.countDocuments({ userId: ANA, source: "system" })).toBe(SEED_RULES.length);
  });

  it("es idempotente por usuario", async () => {
    await seedCategoryRules(ANA);
    expect(await seedCategoryRules(ANA)).toBe(0);
  });

  it("cada usuario tiene su copia", async () => {
    await seedCategoryRules(ANA);
    expect(await seedCategoryRules(BETO)).toBe(SEED_RULES.length);
    expect(await CategoryRuleModel.countDocuments({ userId: BETO })).toBe(SEED_RULES.length);
  });
});
