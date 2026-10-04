import { describe, it, expect } from "vitest";
import { buildInstallmentPurchases, purchaseKey, type InstallmentOccurrence } from "./installmentPurchases.js";

const occurrence = (overrides: Partial<InstallmentOccurrence> = {}): InstallmentOccurrence => ({
  cardLabel: "ICBC",
  merchant: "MERCADOLIBRE",
  category: "Compras",
  date: "2026-05-04",
  amount: 1500,
  installmentCurrent: 1,
  installmentTotal: 3,
  comprobante: "1",
  paymentDate: "2026-06-14",
  ...overrides,
});

const schedule = (occurrences: InstallmentOccurrence[]) =>
  buildInstallmentPurchases(occurrences).map((purchase) => purchase.installments);

describe("purchaseKey", () => {
  it("une tarjeta, fecha, comercio, total de cuotas y comprobante", () => {
    expect(purchaseKey(occurrence())).toBe("ICBC|2026-05-04|MERCADOLIBRE|3|1");
  });

  it("sin comprobante usa un texto vacío", () => {
    expect(purchaseKey(occurrence({ comprobante: null }))).toBe("ICBC|2026-05-04|MERCADOLIBRE|3|");
  });
});

describe("buildInstallmentPurchases", () => {
  it("agrupa la misma compra vista en dos resúmenes y proyecta la cuota que falta un mes después", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ installmentCurrent: 1, paymentDate: "2026-06-14" }),
      occurrence({ installmentCurrent: 2, paymentDate: "2026-07-14" }),
    ]);
    expect(purchases).toEqual([
      {
        id: "ICBC|2026-05-04|MERCADOLIBRE|3|1",
        cardLabel: "ICBC",
        merchant: "MERCADOLIBRE",
        category: "Compras",
        purchaseDate: "2026-05-04",
        installmentTotal: 3,
        installments: [
          { number: 1, amount: 1500, paymentDate: "2026-06-14" },
          { number: 2, amount: 1500, paymentDate: "2026-07-14" },
          { number: 3, amount: 1500, paymentDate: "2026-08-14" },
        ],
      },
    ]);
  });

  it("reconstruye hacia atrás las cuotas anteriores al primer resumen importado", () => {
    expect(schedule([occurrence({ installmentCurrent: 3, installmentTotal: 4, paymentDate: "2026-08-14" })])).toEqual([[
      { number: 1, amount: 1500, paymentDate: "2026-06-14" },
      { number: 2, amount: 1500, paymentDate: "2026-07-14" },
      { number: 3, amount: 1500, paymentDate: "2026-08-14" },
      { number: 4, amount: 1500, paymentDate: "2026-09-14" },
    ]]);
  });

  it("dos cuotas facturadas en el mismo resumen conservan la fecha real de cada una", () => {
    expect(schedule([
      occurrence({ installmentCurrent: 1, paymentDate: "2026-06-14" }),
      occurrence({ installmentCurrent: 2, paymentDate: "2026-07-14" }),
      occurrence({ installmentCurrent: 3, paymentDate: "2026-07-14" }),
    ])).toEqual([[
      { number: 1, amount: 1500, paymentDate: "2026-06-14" },
      { number: 2, amount: 1500, paymentDate: "2026-07-14" },
      { number: 3, amount: 1500, paymentDate: "2026-07-14" },
    ]]);
  });

  it("si una cuota aparece dos veces se queda con la fecha más temprana", () => {
    expect(schedule([
      occurrence({ installmentCurrent: 2, paymentDate: "2026-08-14" }),
      occurrence({ installmentCurrent: 2, paymentDate: "2026-07-14" }),
    ])).toEqual([[
      { number: 1, amount: 1500, paymentDate: "2026-06-14" },
      { number: 2, amount: 1500, paymentDate: "2026-07-14" },
      { number: 3, amount: 1500, paymentDate: "2026-08-14" },
    ]]);
  });

  it("la cuota 1 con centavos distintos no parte la compra y conserva su monto real", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ installmentCurrent: 1, amount: 1500.02, paymentDate: "2026-06-14" }),
      occurrence({ installmentCurrent: 2, amount: 1500, paymentDate: "2026-07-14" }),
    ]);
    expect(purchases).toHaveLength(1);
    expect(purchases[0].installments.map((entry) => entry.amount)).toEqual([1500.02, 1500, 1500]);
  });

  it("distinto comprobante o distinto comercio son compras distintas", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ comprobante: "1" }),
      occurrence({ comprobante: "2" }),
      occurrence({ comprobante: "1", merchant: "FRAVEGA" }),
    ]);
    expect(purchases.map((purchase) => purchase.id)).toEqual([
      "ICBC|2026-05-04|FRAVEGA|3|1",
      "ICBC|2026-05-04|MERCADOLIBRE|3|1",
      "ICBC|2026-05-04|MERCADOLIBRE|3|2",
    ]);
  });

  it("la categoría sale de la aparición más reciente", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ installmentCurrent: 2, category: "Hogar", paymentDate: "2026-07-14" }),
      occurrence({ installmentCurrent: 1, category: "Sin categoría", paymentDate: "2026-06-14" }),
    ]);
    expect(purchases[0].category).toBe("Hogar");
  });

  it("descarta las cuotas con número fuera del plan", () => {
    expect(buildInstallmentPurchases([
      occurrence({ installmentCurrent: 4, installmentTotal: 3 }),
      occurrence({ installmentCurrent: 0, installmentTotal: 3 }),
    ])).toEqual([]);
  });

  it("al proyectar a un mes más corto recorta el día al último del mes", () => {
    expect(schedule([occurrence({ installmentCurrent: 2, paymentDate: "2026-01-31" })])).toEqual([[
      { number: 1, amount: 1500, paymentDate: "2025-12-31" },
      { number: 2, amount: 1500, paymentDate: "2026-01-31" },
      { number: 3, amount: 1500, paymentDate: "2026-02-28" },
    ]]);
  });

  it("ordena las compras por fecha de compra y comercio, y las cuotas por número", () => {
    const purchases = buildInstallmentPurchases([
      occurrence({ merchant: "ZARA", installmentCurrent: 2, paymentDate: "2026-07-14" }),
      occurrence({ merchant: "ZARA", installmentCurrent: 1, paymentDate: "2026-06-14" }),
      occurrence({ merchant: "ADIDAS" }),
      occurrence({ merchant: "COTO", date: "2026-04-01" }),
    ]);
    expect(purchases.map((purchase) => purchase.merchant)).toEqual(["COTO", "ADIDAS", "ZARA"]);
    expect(purchases[2].installments.map((entry) => entry.number)).toEqual([1, 2, 3]);
  });
});
