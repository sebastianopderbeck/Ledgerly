import type { ExtractedPdf } from "@ledgerly/shared";
import { createHash } from "node:crypto";
import type { Types } from "mongoose";
import { parseCoupon } from "../ingestion/parseCoupon.js";
import { saveCoupon, type SaveCouponResult } from "./saveCoupon.js";

export async function importCoupon(input: {
  userId: Types.ObjectId;
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
  extracted?: ExtractedPdf;
}): Promise<SaveCouponResult> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");
  const { coupon } = await parseCoupon(input.data, input.extracted);
  return saveCoupon({ userId: input.userId, coupon, fileName: input.fileName, sourceHash, replace: input.replace });
}
