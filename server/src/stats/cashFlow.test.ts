import { describe, it, expect } from "vitest";
import type { PayslipTipo } from "@ledgerly/shared";
import {
  incomeByMonth, installmentFloor, projectPlanPayment, statementAmountArs, toCashFlowCard,
  type CashFlowCard, type CashFlowPayslip, type CashFlowPlan, type CashFlowStatement,
} from "./cashFlow.js";

const statement = (overrides: Partial<CashFlowStatement> = {}): CashFlowStatement => ({
  issuer: "visa_signature",
  cardLabel: "Visa Signature",
  closingDate: "2026-09-03",
  dueDate: "2026-09-14",
  saldoArs: 100_000,
  saldoUsd: 0,
  uploadedAt: "2026-09-05T10:00:00.000Z",
  ...overrides,
});

const payslip = (fechaPago: string, neto: number, tipo: PayslipTipo = "mensual"): CashFlowPayslip => ({ fechaPago, tipo, neto });

describe("statementAmountArs", () => {
  it("suma los pesos y los dólares al oficial", () => {
    expect(statementAmountArs({ saldoArs: 450_000, saldoUsd: 20 }, 1_400)).toBe(478_000);
  });

  it("sin cotización suma solo los pesos", () => {
    expect(statementAmountArs({ saldoArs: 450_000, saldoUsd: 20 }, null)).toBe(450_000);
  });

  it("un saldo a favor cuenta 0", () => {
    expect(statementAmountArs({ saldoArs: -5_000, saldoUsd: 0 }, null)).toBe(0);
  });
});

describe("toCashFlowCard", () => {
  it("ancla las cuotas al mes de vencimiento y descarta las que no tienen restantes", () => {
    const card = toCashFlowCard(statement({ closingDate: "2026-10-02", dueDate: "2026-10-13" }), [
      { amount: 30_000, installmentCurrent: 1, installmentTotal: 4 },
      { amount: 20_000, installmentCurrent: 3, installmentTotal: 3 },
      { amount: 5_000, installmentCurrent: null, installmentTotal: null },
    ]);
    expect(card).toEqual({
      issuer: "visa_signature",
      cardLabel: "Visa Signature",
      baseMonth: "2026-10",
      installments: [{ amount: 30_000, remaining: 3 }],
    });
  });

  it("sin vencimiento usa el cierre + 12 días: un cierre el 25/9 vence en octubre", () => {
    expect(toCashFlowCard(statement({ closingDate: "2026-09-25", dueDate: null }), [])?.baseMonth).toBe("2026-10");
  });

  it("sin fechas devuelve null", () => {
    expect(toCashFlowCard(statement({ closingDate: null, dueDate: null }), [])).toBeNull();
  });
});

describe("installmentFloor", () => {
  const card: CashFlowCard = {
    issuer: "visa_signature",
    cardLabel: "Visa Signature",
    baseMonth: "2026-10",
    installments: [{ amount: 30_000, remaining: 3 }, { amount: 20_000, remaining: 1 }],
  };

  it("en el mes del último resumen y antes da 0", () => {
    expect(installmentFloor(card, "2026-10")).toBe(0);
    expect(installmentFloor(card, "2026-09")).toBe(0);
  });

  it("suma las cuotas a las que todavía les quedan k meses", () => {
    expect(installmentFloor(card, "2026-11")).toBe(50_000);
    expect(installmentFloor(card, "2026-12")).toBe(30_000);
    expect(installmentFloor(card, "2027-01")).toBe(30_000);
    expect(installmentFloor(card, "2027-02")).toBe(0);
  });
});

describe("projectPlanPayment", () => {
  const plan: CashFlowPlan = {
    coupons: [
      { fecha: "2026-08-17", cuotaNro: 11, monto: 290_000 },
      { fecha: "2026-09-17", cuotaNro: 12, monto: 300_000 },
    ],
    cuotasTotales: 14,
  };

  it("repite la última cuota en los meses siguientes", () => {
    expect(projectPlanPayment(plan, "2026-10")).toBe(300_000);
    expect(projectPlanPayment(plan, "2026-11")).toBe(300_000);
  });

  it("no proyecta el mes de la última cuota ni los anteriores", () => {
    expect(projectPlanPayment(plan, "2026-09")).toBe(0);
    expect(projectPlanPayment(plan, "2026-08")).toBe(0);
  });

  it("deja de proyectar después de la última cuota del plan", () => {
    expect(projectPlanPayment(plan, "2026-12")).toBe(0);
  });

  it("sin cuotas totales proyecta siempre, y sin cupones da 0", () => {
    expect(projectPlanPayment({ ...plan, cuotasTotales: null }, "2030-01")).toBe(300_000);
    expect(projectPlanPayment({ coupons: [], cuotasTotales: null }, "2026-10")).toBe(0);
  });
});

describe("incomeByMonth", () => {
  it("agrupa los recibos por el mes de pago", () => {
    const mensual = payslip("2026-06-30", 1_000_000);
    const sac = payslip("2026-06-30", 500_000, "sac");
    const julio = payslip("2026-07-31", 1_050_000);
    const byMonth = incomeByMonth([mensual, sac, julio]);
    expect(byMonth.get("2026-06")).toEqual([mensual, sac]);
    expect(byMonth.get("2026-07")).toEqual([julio]);
  });
});
