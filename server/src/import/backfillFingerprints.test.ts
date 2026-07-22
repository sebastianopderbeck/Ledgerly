import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { withDb } from "../testing/withDb.js";
import { TransactionModel } from "../db/models.js";
import { backfillFingerprints } from "./backfillFingerprints.js";
import { fingerprintOf } from "./importStatement.js";

withDb();

const base = {
  statementId: new Types.ObjectId(), issuer: "icbc", cardLabel: "ICBC",
  date: new Date("2025-08-25"), descriptionRaw: "VISUAR ICBC MALL", merchant: "VISUAR ICBC MALL",
  category: "Compras", categorySource: "rule" as const, amount: 9999.95, currency: "ARS" as const,
  direction: "debit" as const, type: "purchase" as const, isInstallment: true, comprobante: "001061",
};

beforeEach(async () => {
  await TransactionModel.create({ ...base, installmentCurrent: 5, installmentTotal: 12, fingerprint: "stale" });
  await TransactionModel.create({ ...base, installmentCurrent: 6, installmentTotal: 12, fingerprint: "stale" });
});

describe("backfillFingerprints", () => {
  it("recomputa el fingerprint con el nuevo formato (incluye cuota) y separa las cuotas", async () => {
    const res = await backfillFingerprints();
    expect(res.updated).toBe(2);

    const c5 = await TransactionModel.findOne({ installmentCurrent: 5 });
    const c6 = await TransactionModel.findOne({ installmentCurrent: 6 });
    expect(c5?.fingerprint).toBe(fingerprintOf("icbc", "2025-08-25", "001061", 9999.95, "ARS", 5, 12));
    expect(c6?.fingerprint).toBe(fingerprintOf("icbc", "2025-08-25", "001061", 9999.95, "ARS", 6, 12));
    expect(c5?.fingerprint).not.toBe(c6?.fingerprint);
  });

  it("es idempotente: una segunda corrida no actualiza nada", async () => {
    await backfillFingerprints();
    const res = await backfillFingerprints();
    expect(res.updated).toBe(0);
  });
});
