import mongoose, { type Types } from "mongoose";
import { normalizeEmail } from "../auth/authConfig.js";
import { connectMongo, disconnectMongo } from "./connection.js";
import { CategoryRuleModel, USER_SCOPED_MODEL_NAMES, UserModel } from "./models.js";

export interface MigrationCount {
  collection: string;
  updated: number;
}

export interface MigrationResult {
  ownerId: Types.ObjectId;
  createdOwner: boolean;
  counts: MigrationCount[];
}

const ensureOwner = async (email: string): Promise<{ ownerId: Types.ObjectId; createdOwner: boolean }> => {
  const existing = await UserModel.findOne({ email });
  if (existing) return { ownerId: existing._id, createdOwner: false };
  const owner = await UserModel.create({ email, name: email });
  return { ownerId: owner._id, createdOwner: true };
};

const dropSeededDuplicates = async (ownerId: Types.ObjectId): Promise<void> => {
  const legacyPatterns = await CategoryRuleModel.distinct("pattern", { userId: { $exists: false }, source: "system" });
  if (legacyPatterns.length === 0) return;
  await CategoryRuleModel.deleteMany({ userId: ownerId, source: "system", pattern: { $in: legacyPatterns } });
};

const migrateModel = async (name: string, ownerId: Types.ObjectId): Promise<MigrationCount> => {
  const model = mongoose.model(name);
  const { modifiedCount } = await model.updateMany({ userId: { $exists: false } }, { $set: { userId: ownerId } });
  await model.syncIndexes();
  return { collection: model.collection.collectionName, updated: modifiedCount };
};

export async function migrateOwner(ownerEmail: string): Promise<MigrationResult> {
  const { ownerId, createdOwner } = await ensureOwner(normalizeEmail(ownerEmail));
  await dropSeededDuplicates(ownerId);
  const counts: MigrationCount[] = [];
  for (const name of USER_SCOPED_MODEL_NAMES) counts.push(await migrateModel(name, ownerId));
  return { ownerId, createdOwner, counts };
}

if (process.argv[1]?.endsWith("migrateOwner.ts")) {
  const ownerEmail = process.env.OWNER_EMAIL?.trim() ?? "";
  if (ownerEmail === "") throw new Error("Falta OWNER_EMAIL en el .env");
  await connectMongo(process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly");
  const { createdOwner, counts } = await migrateOwner(ownerEmail);
  console.log(createdOwner ? "Owner creado" : "Owner existente");
  for (const { collection, updated } of counts) console.log(`  ${collection}: ${updated} actualizados`);
  await disconnectMongo();
}
