import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { CategoryRuleModel, StatementModel, TransactionModel, UserModel, USER_SCOPED_MODEL_NAMES } from "./models.js";
import { SEED_RULES } from "../rules/categorize.js";
import { seedCategoryRules } from "../rules/seedRules.js";
import { migrateOwner } from "./migrateOwner.js";

withDb();

const legacyStatement = {
  issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-07-02"), dueDate: new Date("2026-07-14"),
  totals: { totalConsumos: { ars: 1, usd: 0 }, saldoActual: { ars: 1, usd: 0 }, pagoMinimo: { ars: 1, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
  sourceFileName: "r.pdf", sourceHash: "hash-legado", pageCount: 1, parserVersion: "1.0.0", needsReview: false,
  reconciliation: { ok: true, entries: [] }, reviewedKeys: [],
};

const seedLegacy = async () => {
  await StatementModel.init();
  await StatementModel.collection.createIndex({ sourceHash: 1 }, { unique: true, name: "sourceHash_1" });
  await StatementModel.collection.insertOne({ ...legacyStatement });
  await TransactionModel.collection.insertOne({ descripcion: "legado" });
};

describe("migrateOwner", () => {
  it("crea al owner y le asigna todo lo que no tiene userId", async () => {
    await seedLegacy();
    const { ownerId, createdOwner, counts } = await migrateOwner(" Owner@Test.dev ");
    expect(createdOwner).toBe(true);
    expect((await UserModel.findOne({ email: "owner@test.dev" }))?._id.equals(ownerId)).toBe(true);
    expect(await StatementModel.countDocuments({ userId: ownerId })).toBe(1);
    expect(await TransactionModel.countDocuments({ userId: ownerId })).toBe(1);
    expect(counts).toHaveLength(USER_SCOPED_MODEL_NAMES.length);
    expect(counts.find(({ collection }) => collection === "statements")?.updated).toBe(1);
  });

  it("reemplaza el índice único viejo por el compuesto", async () => {
    await seedLegacy();
    await migrateOwner("owner@test.dev");
    const names = (await StatementModel.collection.indexes()).map(({ name }) => name);
    expect(names).not.toContain("sourceHash_1");
    expect(names).toContain("userId_1_sourceHash_1");
  });

  it("una segunda corrida no actualiza nada ni crea otro owner", async () => {
    await seedLegacy();
    const first = await migrateOwner("owner@test.dev");
    const second = await migrateOwner("owner@test.dev");
    expect(second.createdOwner).toBe(false);
    expect(second.ownerId.equals(first.ownerId)).toBe(true);
    expect(second.counts.every(({ updated }) => updated === 0)).toBe(true);
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it("con la base vacía solo crea al owner", async () => {
    const { createdOwner, counts } = await migrateOwner("owner@test.dev");
    expect(createdOwner).toBe(true);
    expect(counts.every(({ updated }) => updated === 0)).toBe(true);
  });
});

describe("migrateOwner si el owner entró antes de migrar", () => {
  it("no duplica las reglas del sistema y respeta las que estaban apagadas", async () => {
    const [apagada, ...resto] = SEED_RULES;
    await CategoryRuleModel.collection.insertOne({ ...apagada, source: "system", enabled: false });
    await CategoryRuleModel.collection.insertOne({ ...resto[0], source: "system", enabled: true });
    await CategoryRuleModel.collection.insertOne({ priority: 100, matchType: "contains", pattern: "MIO", category: "Otros", source: "user", enabled: true });
    const owner = await UserModel.create({ email: "owner@test.dev", name: "Owner" });
    await seedCategoryRules(owner._id);

    await migrateOwner("owner@test.dev");

    const rules = await CategoryRuleModel.find({ userId: owner._id }).lean();
    expect(rules.filter((rule) => rule.source === "system")).toHaveLength(SEED_RULES.length);
    const sameAsApagada = rules.filter((rule) => rule.pattern === apagada.pattern);
    expect(sameAsApagada).toHaveLength(1);
    expect(sameAsApagada[0].enabled).toBe(false);
    expect(rules.filter((rule) => rule.source === "user").map((rule) => rule.pattern)).toEqual(["MIO"]);
  });
});
