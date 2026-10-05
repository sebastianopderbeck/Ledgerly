import { describe, it, expect } from "vitest";
import { mortgageCouponDtoSchema, creditSummaryDtoSchema, importResultUnionSchema, inflationRateDtoSchema } from "./dtos.js";

describe("mortgageCouponDtoSchema", () => {
  it("valida un cupón", () => {
    const dto = {
      id: "x", prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18",
      capital: 184689.39, intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93,
      cuotaPuraUva: 699.6, cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84,
      tea: 9.27, tna: 8.9, cft: 0,
      tipoCambioUsd: 1350.5, tipoCambioSource: "api", totalUsd: 1044.58,
    };
    expect(mortgageCouponDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("inflationRateDtoSchema", () => {
  it("valida un punto de inflación mensual", () => {
    const dto = { periodo: "2025-01", variacionMensual: 2.2 };
    expect(inflationRateDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("creditSummaryDtoSchema", () => {
  it("valida el resumen de avance", () => {
    const dto = {
      prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240,
      totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
      capitalOriginalUva: 1, capitalAmortizadoUva: 1, capitalPendienteUva: 1, capitalPendientePesos: 1,
      porcentajeAvanceCapital: 0.017, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9,
      tasaRealMensual: 0.0074,
    };
    expect(creditSummaryDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("importResultUnionSchema", () => {
  it("discrimina por kind", () => {
    const coupon = { kind: "coupon", status: "imported", coupon: {
      id: "x", prestamoNro: "1", cuotaNro: 1, fechaDebito: "2025-08-18", capital: 1, intereses: 1,
      seguroIncendio: 1, totalDebitado: 1, cuotaPuraUva: 1, cotizacionUva: 1, capitalUva: 1, interesUva: 1,
      tea: 1, tna: 1, cft: 0,
      tipoCambioUsd: null, tipoCambioSource: null, totalUsd: null } };
    expect(importResultUnionSchema.parse(coupon).kind).toBe("coupon");
  });
});

import { autoCouponDtoSchema, autoSummaryDtoSchema } from "./dtos.js";

describe("autoCouponDtoSchema", () => {
  it("valida un cupón de auto con conceptos", () => {
    const dto = {
      id: "x", grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
      fechaEmision: "2024-10-18", fechaVencimiento: "2024-11-11", comprobante: "000062757060",
      modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01,
      conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }, { label: "DIFERIMIENTO COMERCIAL", amount: -70607.06 }],
      totalAPagar: 268551.23, tipoCambioUsd: 1000, tipoCambioSource: "api", totalUsd: 268.55,
    };
    expect(autoCouponDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("autoSummaryDtoSchema", () => {
  it("valida el resumen del plan", () => {
    const dto = {
      grupo: "3684", orden: "97", plan: "K", modelo: "C3 AIRCROSS",
      cuotasPagadas: 4, cuotasTotales: 120, porcentajeAvance: 0.0333, totalPagado: 1428724.71,
      valorActualAuto: 41580000, totalPagadoUsd: 1000, ultimaCuota: 22, fechaUltimoVencimiento: "2026-07-10",
    };
    expect(autoSummaryDtoSchema.parse(dto)).toEqual(dto);
  });
});

import { oficialRateDtoSchema, monthlyUsdStatSchema } from "./dtos.js";

describe("oficialRateDtoSchema", () => {
  it("valida la cotización oficial y acepta rate null", () => {
    expect(oficialRateDtoSchema.parse({ date: "2026-07-20", rate: 1000, source: "oficial" }))
      .toEqual({ date: "2026-07-20", rate: 1000, source: "oficial" });
    expect(oficialRateDtoSchema.parse({ date: "2026-07-20", rate: null, source: "oficial" }).rate).toBeNull();
  });
});

describe("monthlyUsdStatSchema", () => {
  it("valida un punto mensual en USD y acepta rate/totalUsd null", () => {
    const dto = { month: "2026-05", totalArs: 2000, rate: 1000, totalUsd: 2 };
    expect(monthlyUsdStatSchema.parse(dto)).toEqual(dto);
    expect(monthlyUsdStatSchema.parse({ month: "2026-06", totalArs: 500, rate: null, totalUsd: null }).totalUsd).toBeNull();
  });
});

import { macroSeriesDtoSchema } from "./dtos.js";

describe("macroSeriesDtoSchema", () => {
  it("valida la serie macro mensual", () => {
    const dto = {
      desde: "2025-01",
      meses: [{ periodo: "2025-01", usdOficial: 1035.5, uva: 1250.3, tasa30: 29.1, inflacion: 2.2 }],
      hoy: { fecha: "2026-08-14", usdOficial: 1515, uva: 2075.56, tasa30: 20.04 },
    };
    expect(macroSeriesDtoSchema.parse(dto)).toEqual(dto);
  });

  it("acepta huecos como null en cualquier serie", () => {
    const dto = {
      desde: "2025-01",
      meses: [{ periodo: "2025-01", usdOficial: null, uva: null, tasa30: null, inflacion: null }],
      hoy: { fecha: "2026-08-14", usdOficial: null, uva: null, tasa30: null },
    };
    expect(macroSeriesDtoSchema.parse(dto).meses[0].usdOficial).toBeNull();
  });
});

import { macroRefreshDtoSchema } from "./dtos.js";

describe("macroRefreshDtoSchema", () => {
  it("valida el resumen de una actualización", () => {
    const dto = {
      series: { usdOficial: 232, uva: 232, tasa30: 221, inflacion: 19 },
      tipoCambio: {
        cupones: { updated: 12, skipped: 1 },
        auto: { updated: 8, skipped: 0 },
        sueldos: { updated: 6, skipped: 0 },
      },
    };
    expect(macroRefreshDtoSchema.parse(dto)).toEqual(dto);
  });

  it("rechaza un resumen sin el detalle de tipo de cambio", () => {
    const dto = { series: { usdOficial: 232, uva: 232, tasa30: 221, inflacion: 19 } };
    expect(macroRefreshDtoSchema.safeParse(dto).success).toBe(false);
  });
});

import {
  budgetDtoSchema, budgetInputSchema, budgetPatchSchema, budgetSpendingDtoSchema, cashFlowDtoSchema,
  inboxRuleResultDtoSchema, installmentPurchaseDtoSchema, isoDateSchema, mailSourceStatusDtoSchema, mailSyncRunDtoSchema,
  MANUAL_ASSET_TYPE_LABELS, manualAssetCreateSchema, manualAssetTypeSchema, manualAssetUpdateSchema, netWorthDtoSchema,
  statementReviewDtoSchema, statementReviewKeysDtoSchema, statementReviewPatchSchema, subscriptionsReportDtoSchema,
  uncategorizedInboxDtoSchema,
} from "./dtos.js";

const cashFlowMonth = {
  mes: "2026-09", estado: "completo", ingreso: 1100000, conSac: false, tarjetas: 578000,
  hipoteca: 300000, auto: 150000, egresos: 1028000, margen: 72000, tasaAhorro: 0.0655,
  faltantes: [], estimados: [],
};

describe("cashFlowDtoSchema", () => {
  it("valida un mes completo y uno proyectado", () => {
    const dto = {
      mesActual: "2026-10",
      meses: [
        cashFlowMonth,
        { ...cashFlowMonth, mes: "2026-11", estado: "proyectado", tarjetas: 60000, egresos: 510000,
          margen: 590000, tasaAhorro: 0.536, estimados: ["Sueldo (último neto)", "ICBC (solo cuotas)"] },
      ],
    };
    expect(cashFlowDtoSchema.parse(dto)).toEqual(dto);
  });

  it("acepta un mes incompleto sin ingreso ni margen", () => {
    const dto = { mesActual: "2026-10", meses: [{ ...cashFlowMonth, estado: "incompleto", ingreso: null,
      margen: null, tasaAhorro: null, faltantes: ["Recibo de sueldo"] }] };
    expect(cashFlowDtoSchema.parse(dto).meses[0].ingreso).toBeNull();
  });

  it("rechaza un estado desconocido", () => {
    const dto = { mesActual: "2026-10", meses: [{ ...cashFlowMonth, estado: "cerrado" }] };
    expect(cashFlowDtoSchema.safeParse(dto).success).toBe(false);
  });
});

const subscription = {
  key: "MUSICAPP", nombre: "MUSICAPP", busqueda: "MUSICAPP", categoria: "Suscripciones", cardLabel: "ICBC",
  moneda: "ARS", montoActual: 5490, montoMensualArs: 5490,
  primerCobro: "2026-03-12", ultimoCobro: "2026-08-12", proximoCobro: "2026-09-12",
  cobros: 6, estado: "activa", oculta: false,
  aumento: { variacion: 0.1002, desde: "2026-03", montoAnterior: 4990 }, monedaAnterior: null,
};

describe("subscriptionsReportDtoSchema", () => {
  it("valida un reporte con una suscripción activa con aumento y una cortada", () => {
    const dto = {
      cotizacionOficial: 1465, totalMensualArs: 5490, totalMensualUsd: 0, totalAnualArs: 65880,
      items: [
        subscription,
        { ...subscription, key: "STREAMFLIX COM", nombre: "STREAMFLIX.COM", busqueda: "STREAMFLIX", moneda: "USD",
          montoActual: 12.99, montoMensualArs: null, estado: "cortada", aumento: null, monedaAnterior: "ARS" },
      ],
    };
    expect(subscriptionsReportDtoSchema.parse(dto)).toEqual(dto);
  });

  it("rechaza una suscripción sin cobros", () => {
    const dto = { cotizacionOficial: null, totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0,
      items: [{ ...subscription, cobros: 0 }] };
    expect(subscriptionsReportDtoSchema.safeParse(dto).success).toBe(false);
  });
});

const reviewStatement = {
  id: "s3", issuer: "visa_signature", cardLabel: "Visa Signature ****1234", last4: "1234",
  closingDate: "2026-09-25", dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 1000, usd: 0 }, saldoActual: { ars: 1000, usd: 45 },
    pagoMinimo: { ars: 100, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "visa.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
  transactionCount: 2, uploadedAt: "2026-09-26T12:00:00.000Z",
};

const reviewTransaction = {
  id: "t31", statementId: "s3", issuer: "visa_signature", cardLabel: "Visa Signature ****1234",
  date: "2026-09-12", descriptionRaw: "COMERCIO UNO", merchant: "COMERCIO UNO", category: "Comida",
  categorySource: "rule", amount: 2500, currency: "ARS", direction: "debit", type: "purchase",
  isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: null,
};

describe("statementReviewDtoSchema", () => {
  it("valida una revisión con un hallazgo de movimiento y uno de categoría", () => {
    const dto = {
      statement: reviewStatement, previousStatements: 9, historyStatements: 6, skippedChecks: [],
      findings: [
        { kind: "transaction", key: "tx:t31", transaction: reviewTransaction, reasons: ["duplicado"],
          duplicateOf: { transactionId: "t30", date: "2026-09-11", sameStatement: true }, usualUsd: null },
        { kind: "category", key: "cat:Supermercado", category: "Supermercado", total: 450000, average: 250000, ratio: 1.8 },
      ],
      reviewedKeys: ["tx:t31"],
    };
    expect(statementReviewDtoSchema.parse(dto)).toEqual(dto);
  });

  it("rechaza un hallazgo de movimiento sin motivos", () => {
    const dto = {
      statement: reviewStatement, previousStatements: 0, historyStatements: 0, skippedChecks: ["usd", "nuevo", "categoria"],
      findings: [{ kind: "transaction", key: "tx:t31", transaction: reviewTransaction, reasons: [], duplicateOf: null, usualUsd: null }],
      reviewedKeys: [],
    };
    expect(statementReviewDtoSchema.safeParse(dto).success).toBe(false);
  });
});

describe("statementReviewPatchSchema", () => {
  it("acepta tildar varias claves", () => {
    expect(statementReviewPatchSchema.parse({ keys: ["tx:a", "cat:Comida"], reviewed: true }).keys).toHaveLength(2);
  });

  it("rechaza keys vacío y claves vacías", () => {
    expect(statementReviewPatchSchema.safeParse({ keys: [], reviewed: true }).success).toBe(false);
    expect(statementReviewPatchSchema.safeParse({ keys: [""], reviewed: false }).success).toBe(false);
    expect(statementReviewPatchSchema.safeParse({ keys: ["tx:a"] }).success).toBe(false);
  });

  it("la respuesta lleva las claves tildadas", () => {
    expect(statementReviewKeysDtoSchema.parse({ reviewedKeys: ["tx:a"] })).toEqual({ reviewedKeys: ["tx:a"] });
  });
});

describe("installmentPurchaseDtoSchema", () => {
  it("valida una compra en 4 cuotas", () => {
    const dto = {
      id: "ICBC|2026-05-04|MERCADOLIBRE|4|1", cardLabel: "ICBC", merchant: "MERCADOLIBRE", category: "Compras",
      purchaseDate: "2026-05-04", installmentTotal: 4,
      installments: [
        { number: 1, amount: 1500, paymentDate: "2026-06-14" },
        { number: 2, amount: 1500, paymentDate: "2026-07-14" },
        { number: 3, amount: 1500, paymentDate: "2026-08-14" },
        { number: 4, amount: 1500, paymentDate: "2026-09-14" },
      ],
    };
    expect(installmentPurchaseDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("isoDateSchema", () => {
  it("acepta fechas de calendario y rechaza las inexistentes o mal formadas", () => {
    expect(isoDateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(isoDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(isoDateSchema.safeParse("2026-1-5").success).toBe(false);
  });
});

describe("manualAssetCreateSchema", () => {
  const valid = { nombre: "  Ahorros  ", tipo: "ahorro", moneda: "USD", valuacion: { fecha: "2026-10-01", monto: 5000 } };

  it("acepta un activo válido y recorta el nombre", () => {
    expect(manualAssetCreateSchema.parse(valid).nombre).toBe("Ahorros");
  });

  it("rechaza fecha inválida, monto negativo y claves extra", () => {
    expect(manualAssetCreateSchema.safeParse({ ...valid, valuacion: { fecha: "2026-02-30", monto: 1 } }).success).toBe(false);
    expect(manualAssetCreateSchema.safeParse({ ...valid, valuacion: { fecha: "2026-10-01", monto: -1 } }).success).toBe(false);
    expect(manualAssetCreateSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(manualAssetCreateSchema.safeParse({ ...valid, nombre: "   " }).success).toBe(false);
  });

  it("tiene una etiqueta por cada tipo de activo", () => {
    expect(Object.keys(MANUAL_ASSET_TYPE_LABELS).sort()).toEqual([...manualAssetTypeSchema.options].sort());
    expect(MANUAL_ASSET_TYPE_LABELS.plazo_fijo).toBe("Plazo fijo");
  });
});

describe("manualAssetUpdateSchema", () => {
  it("acepta cambios parciales y rechaza la moneda", () => {
    expect(manualAssetUpdateSchema.parse({ nombre: "Cuenta sueldo" })).toEqual({ nombre: "Cuenta sueldo" });
    expect(manualAssetUpdateSchema.parse({})).toEqual({});
    expect(manualAssetUpdateSchema.safeParse({ moneda: "USD" }).success).toBe(false);
  });
});

describe("netWorthDtoSchema", () => {
  it("valida la foto con su evolución", () => {
    const totales = { activosArs: 17500000, pasivosArs: 10068000, netoArs: 7432000, activosUsd: 17500, pasivosUsd: 10068, netoUsd: 7432 };
    const dto = {
      fecha: "2026-10-03", usdOficial: 1000, usdOficialFecha: "2026-10-02", uva: 2000, uvaFecha: "2026-10-03",
      totales,
      items: [
        { id: "auto", lado: "activo", fuente: "auto", label: "Auto", detalle: "MODELO X · valor móvil de la cuota 30",
          fecha: "2026-09-18", moneda: "ARS", montoOriginal: 12000000, ars: 12000000, usd: 12000, assetId: null },
        { id: "a1", lado: "activo", fuente: "manual", label: "Ahorros", detalle: "Ahorros",
          fecha: "2026-10-01", moneda: "USD", montoOriginal: 5000, ars: 5000000, usd: 5000, assetId: "a1" },
      ],
      evolucion: [{ periodo: "2026-10", ...totales }],
      activosManuales: [{ id: "a1", nombre: "Ahorros", tipo: "ahorro", moneda: "USD", valuaciones: [{ fecha: "2026-10-01", monto: 5000 }] }],
    };
    expect(netWorthDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("budget schemas", () => {
  it("validan un tope, su alta y el gasto por mes y categoría", () => {
    const budget = { id: "b1", category: "Comida", topeArs: 300000, ajustaInflacion: true, periodoBase: "2026-08" };
    expect(budgetDtoSchema.parse(budget)).toEqual(budget);
    expect(budgetInputSchema.parse({ category: " Comida ", topeArs: 300000 })).toEqual({
      category: "Comida", topeArs: 300000, ajustaInflacion: false,
    });
    const spending = { ultimoMesCerrado: "2026-09", gastos: [{ month: "2026-09", category: "Comida", total: 250000, count: 12 }] };
    expect(budgetSpendingDtoSchema.parse(spending)).toEqual(spending);
  });

  it("rechazan un tope no positivo y un patch vacío", () => {
    expect(budgetInputSchema.safeParse({ category: "Comida", topeArs: 0 }).success).toBe(false);
    expect(budgetInputSchema.safeParse({ category: "  ", topeArs: 10 }).success).toBe(false);
    expect(budgetPatchSchema.safeParse({}).success).toBe(false);
    expect(budgetPatchSchema.safeParse({ topeArs: -1 }).success).toBe(false);
    expect(budgetPatchSchema.safeParse({ ajustaInflacion: true }).success).toBe(true);
  });
});

describe("uncategorizedInboxDtoSchema", () => {
  it("valida la bandeja y el resultado de crear una regla", () => {
    const inbox = {
      pendingCount: 8, usdRate: 1415,
      groups: [{ pattern: "STEAMGAMES.COM", merchants: ["STEAMGAMES.COM 4259522985"], count: 2, totalArs: 0,
        totalUsd: 19.98, equivalentArs: 28271.7, lastDate: "2026-09-14" }],
    };
    expect(uncategorizedInboxDtoSchema.parse(inbox)).toEqual(inbox);
    const result = {
      rule: { id: "r1", priority: 100, matchType: "contains", pattern: "PANADERIA", category: "Comida", source: "user", enabled: true },
      categorized: 6,
    };
    expect(inboxRuleResultDtoSchema.parse(result)).toEqual(result);
  });
});

describe("mailSourceStatusDtoSchema", () => {
  it("valida un status habilitado con la última corrida", () => {
    const dto = {
      source: "icloud", enabled: true, missing: [], scope: "INBOX · desde el 01/09/2026",
      schedule: "todos los días a las 21 h, del 25 al 5",
      lastRun: {
        source: "icloud", trigger: "job", startedAt: "2026-10-03T14:05:00.000Z", finishedAt: "2026-10-03T14:05:09.000Z",
        status: "ok", error: null, messagesChecked: 2, hasMore: false,
        items: [
          { id: "g1", fileName: "resumen-sintetico.pdf", receivedAt: "2026-09-28T10:00:00.000Z", outcome: "imported",
            kind: "statement", documentId: "s1", detail: "Visa Signature ****1234 · 42 movimientos" },
          { id: "g2", fileName: "factura.pdf", receivedAt: "2026-09-27T10:00:00.000Z", outcome: "skipped",
            kind: null, documentId: null, detail: "Formato de resumen no reconocido" },
        ],
      },
    };
    expect(mailSourceStatusDtoSchema.parse(dto)).toEqual(dto);
  });

  it("valida un status deshabilitado", () => {
    const dto = {
      source: "gmail", enabled: false, missing: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
      scope: null, schedule: null, lastRun: null,
    };
    expect(mailSourceStatusDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("mailSyncRunDtoSchema", () => {
  const run = {
    source: "icloud", trigger: "job", startedAt: "2026-10-05T12:00:00.000Z", finishedAt: "2026-10-05T12:00:09.000Z",
    status: "ok", error: null, messagesChecked: 0, hasMore: false, items: [],
  };

  it("acepta las dos fuentes y rechaza otra", () => {
    expect(mailSyncRunDtoSchema.parse(run).source).toBe("icloud");
    expect(mailSyncRunDtoSchema.parse({ ...run, source: "gmail" }).source).toBe("gmail");
    expect(() => mailSyncRunDtoSchema.parse({ ...run, source: "yahoo" })).toThrow();
  });
});
