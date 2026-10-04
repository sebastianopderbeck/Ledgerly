import { describe, it, expect } from "vitest";
import type { InflationRateDTO, InstallmentPurchaseDTO } from "@ledgerly/shared";
import { computeInstallmentSavings, savingsByMerchant, type PurchaseSaving } from "./installmentSavings.js";

const purchase = (overrides: Partial<InstallmentPurchaseDTO> = {}): InstallmentPurchaseDTO => ({
  id: "ICBC|2026-01-15|MERCADOLIBRE|3|1",
  cardLabel: "ICBC",
  merchant: "MERCADOLIBRE",
  category: "Compras",
  purchaseDate: "2026-01-15",
  installmentTotal: 3,
  installments: [
    { number: 1, amount: 1000, paymentDate: "2026-02-10" },
    { number: 2, amount: 1000, paymentDate: "2026-03-10" },
    { number: 3, amount: 1000, paymentDate: "2026-04-10" },
  ],
  ...overrides,
});

const inflation: InflationRateDTO[] = [
  { periodo: "2026-03", variacionMensual: 2 },
  { periodo: "2026-02", variacionMensual: 2 },
];

describe("computeInstallmentSavings", () => {
  it("calcula el ejemplo del spec: cuotas pagadas con IPC y la que falta con el supuesto", () => {
    const summary = computeInstallmentSavings([purchase()], inflation, "2026-03-20")!;
    const [first] = summary.purchases;
    expect(first.installments.map((entry) => entry.realValue)).toEqual([
      expect.closeTo(980.39, 2),
      expect.closeTo(961.17, 2),
      expect.closeTo(942.32, 2),
    ]);
    expect(first.installments.map((entry) => entry.paid)).toEqual([true, true, false]);
    expect(first.installments.map((entry) => entry.estimated)).toEqual([false, false, true]);
    expect(first.cashPrice).toBe(3000);
    expect(first.saving).toBeCloseTo(116.12, 2);
    expect(summary.cashPrice).toBe(3000);
    expect(summary.realValue).toBeCloseTo(2883.88, 2);
    expect(summary.saving).toBeCloseTo(116.12, 2);
    expect(summary.savingPercent).toBeCloseTo(3.87, 2);
    expect(summary.paidSaving).toBeCloseTo(58.44, 2);
    expect(summary.futureSaving).toBeCloseTo(57.68, 2);
    expect(summary).toMatchObject({
      paidCount: 2,
      futureCount: 1,
      estimatedPaidCount: 0,
      assumption: { periodo: "2026-03", variacionMensual: 2 },
    });
  });

  it("una cuota que vence hoy cuenta como pagada y la del día siguiente, no", () => {
    const onDueDate = computeInstallmentSavings([purchase()], inflation, "2026-03-10")!;
    expect(onDueDate.purchases[0].installments.map((entry) => entry.paid)).toEqual([true, true, false]);
    const dayBefore = computeInstallmentSavings([purchase()], inflation, "2026-03-09")!;
    expect(dayBefore.purchases[0].installments.map((entry) => entry.paid)).toEqual([true, false, false]);
  });

  it("cuenta las cuotas pagadas en un mes sin IPC publicado", () => {
    const onlyFebruary: InflationRateDTO[] = [{ periodo: "2026-02", variacionMensual: 2 }];
    const summary = computeInstallmentSavings([purchase()], onlyFebruary, "2026-03-20")!;
    expect(summary.estimatedPaidCount).toBe(1);
    expect(summary.purchases[0].installments.map((entry) => entry.estimated)).toEqual([false, true, true]);
  });

  it("una cuota pagada en el mismo mes de la compra no ahorra nada", () => {
    const sameMonth = purchase({
      purchaseDate: "2026-02-01",
      installmentTotal: 1,
      installments: [{ number: 1, amount: 1000, paymentDate: "2026-02-25" }],
    });
    const summary = computeInstallmentSavings([sameMonth], inflation, "2026-03-20")!;
    expect(summary.saving).toBe(0);
    expect(summary.purchases[0].installments[0].estimated).toBe(false);
  });

  it("con IPC negativo el ahorro da negativo", () => {
    const deflation: InflationRateDTO[] = [{ periodo: "2026-02", variacionMensual: -1 }];
    const single = purchase({ installmentTotal: 1, installments: [{ number: 1, amount: 1000, paymentDate: "2026-02-10" }] });
    const summary = computeInstallmentSavings([single], deflation, "2026-03-20")!;
    expect(summary.saving).toBeCloseTo(-10.1, 2);
    expect(summary.savingPercent).toBeLessThan(0);
  });

  it("sin inflación no puede estimar", () => {
    expect(computeInstallmentSavings([purchase()], [], "2026-03-20")).toBeNull();
  });

  it("sin compras devuelve un resumen en cero", () => {
    expect(computeInstallmentSavings([], inflation, "2026-03-20")).toEqual({
      purchases: [],
      cashPrice: 0,
      realValue: 0,
      saving: 0,
      savingPercent: 0,
      paidSaving: 0,
      futureSaving: 0,
      paidCount: 0,
      futureCount: 0,
      estimatedPaidCount: 0,
      assumption: { periodo: "2026-03", variacionMensual: 2 },
    });
  });
});

const purchaseSaving = (id: string, merchant: string, paidSaving: number, futureSaving: number): PurchaseSaving => ({
  id,
  merchant,
  cardLabel: "ICBC",
  category: "Compras",
  purchaseDate: "2026-01-15",
  installmentTotal: 3,
  cashPrice: 1000,
  realValue: 1000 - paidSaving - futureSaving,
  saving: paidSaving + futureSaving,
  savingPercent: (paidSaving + futureSaving) / 10,
  paidSaving,
  futureSaving,
  installments: [],
});

describe("savingsByMerchant", () => {
  it("agrupa por comercio, cuenta compras, ordena por ahorro y corta en el límite", () => {
    const merchants = savingsByMerchant([
      purchaseSaving("a1", "MERCADOLIBRE", 10, 5),
      purchaseSaving("b1", "FRAVEGA", 30, 0),
      purchaseSaving("a2", "MERCADOLIBRE", 1, 2),
      purchaseSaving("c1", "COTO", 1, 1),
    ], 2);
    expect(merchants).toEqual([
      { merchant: "FRAVEGA", paidSaving: 30, futureSaving: 0, saving: 30, purchaseCount: 1 },
      { merchant: "MERCADOLIBRE", paidSaving: 11, futureSaving: 7, saving: 18, purchaseCount: 2 },
    ]);
  });
});
