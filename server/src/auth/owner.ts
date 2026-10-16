import type { Types } from "mongoose";
import { UserModel } from "../db/models.js";
import { normalizeEmail } from "./authConfig.js";

export const MISSING_OWNER = "Falta el usuario owner: corré bun run migrate:owner";
export const MISSING_OWNER_EMAIL = "Falta OWNER_EMAIL en el .env";

export async function findOwnerId(ownerEmail: string): Promise<Types.ObjectId | null> {
  const owner = await UserModel.findOne({ email: normalizeEmail(ownerEmail) }, { _id: 1 }).lean();
  return owner?._id ?? null;
}

export async function requireOwnerId(env: NodeJS.ProcessEnv): Promise<Types.ObjectId> {
  const email = env.OWNER_EMAIL?.trim() ?? "";
  if (email === "") throw new Error(MISSING_OWNER_EMAIL);
  const ownerId = await findOwnerId(email);
  if (!ownerId) throw new Error(MISSING_OWNER);
  return ownerId;
}
