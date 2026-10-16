import type { HydratedDocument } from "mongoose";
import { UserModel, type UserDoc } from "../db/models.js";
import { normalizeEmail } from "./authConfig.js";

export interface LoginRecord {
  user: HydratedDocument<UserDoc>;
  created: boolean;
}

export async function recordLogin(email: string, name: string, now: Date = new Date()): Promise<LoginRecord> {
  const normalized = normalizeEmail(email);
  const existing = await UserModel.findOne({ email: normalized });
  if (existing) {
    existing.name = name;
    existing.lastLoginAt = now;
    await existing.save();
    return { user: existing, created: false };
  }
  const user = await UserModel.create({ email: normalized, name, lastLoginAt: now });
  return { user, created: true };
}
