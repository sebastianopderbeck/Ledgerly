import type { Types } from "mongoose";

export const ownedBy = <T extends object>(userId: Types.ObjectId, docs: T[]): (T & { userId: Types.ObjectId })[] =>
  docs.map((doc) => ({ ...doc, userId }));
