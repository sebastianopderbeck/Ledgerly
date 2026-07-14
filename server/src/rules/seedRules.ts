import { CategoryRuleModel } from "../db/models.js";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { SEED_RULES } from "./categorize.js";

export async function seedCategoryRules(): Promise<number> {
  let inserted = 0;
  for (const rule of SEED_RULES) {
    const exists = await CategoryRuleModel.findOne({ pattern: rule.pattern, source: "system" });
    if (!exists) {
      await CategoryRuleModel.create({ ...rule, source: "system", enabled: true });
      inserted += 1;
    }
  }
  return inserted;
}

if (process.argv[1]?.endsWith("seedRules.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const n = await seedCategoryRules();
  console.log(`Reglas insertadas: ${n}`);
  await disconnectMongo();
}
