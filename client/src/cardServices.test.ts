import { describe, it, expect } from "vitest";
import type { TransactionDTO } from "@ledgerly/shared";
import { canMarkAsService } from "./cardServices.js";

const gasco: TransactionDTO = {
  id: "t1", statementId: "s", issuer: "visa_signature", cardLabel: "Visa", date: "2026-09-20",
  descriptionRaw: "GASCO", merchant: "GASCO", category: "Servicios", categorySource: "rule",
  amount: 20_000, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
  installmentCurrent: null, installmentTotal: null, comprobante: null,
};

describe("canMarkAsService", () => {
  it("una compra en pesos en un pago se puede marcar", () => {
    expect(canMarkAsService(gasco)).toBe(true);
  });

  it("no se puede marcar en dólares, en cuotas ni un crédito", () => {
    expect(canMarkAsService({ ...gasco, currency: "USD" })).toBe(false);
    expect(canMarkAsService({ ...gasco, isInstallment: true, installmentCurrent: 1, installmentTotal: 3 })).toBe(false);
    expect(canMarkAsService({ ...gasco, direction: "credit" })).toBe(false);
  });
});
