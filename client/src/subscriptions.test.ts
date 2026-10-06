import { describe, expect, it } from "vitest";
import type { SubscriptionDTO, SubscriptionIncrease, TransactionDTO } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import {
  AMOUNT_LABEL,
  activeCountLabel,
  CADENCE_LABELS,
  cadenceAmountCaption,
  cadenceMenuLabel,
  cadenceMenuTooltip,
  canMarkAsSubscription,
  increaseDetail,
  increaseLabel,
  increaseShortLabel,
  increaseSinceDetail,
  monthlyKpiSub,
  previousCurrencyLabel,
  subscriptionMeta,
  subscriptionSections,
  subscriptionTransactionsLink,
} from "./subscriptions.js";

const aumento: SubscriptionIncrease = { variacion: 0.1002, desde: "2026-03", montoAnterior: 4990 };

const item = (overrides: Partial<SubscriptionDTO>): SubscriptionDTO => ({
  key: "MUSICAPP",
  nombre: "MUSICAPP",
  busqueda: "MUSICAPP",
  categoria: "Suscripciones",
  cardLabel: "ICBC",
  moneda: "ARS",
  montoActual: 5490,
  montoMensualArs: 5490,
  primerCobro: "2026-03-12",
  ultimoCobro: "2026-08-12",
  proximoCobro: "2026-09-12",
  cobros: 6,
  estado: "activa",
  oculta: false,
  aumento: null,
  monedaAnterior: null,
  cadencia: "mensual",
  ...overrides,
});

const keys = (items: SubscriptionDTO[]): string[] => items.map(({ key }) => key);

describe("subscriptionSections", () => {
  it("separa activas, cortadas y ocultas respetando el orden del server", () => {
    const sections = subscriptionSections([
      item({ key: "A", montoMensualArs: 9000, aumento }),
      item({ key: "B", moneda: "USD", montoActual: 10, montoMensualArs: 14650 }),
      item({ key: "C", estado: "cortada", montoMensualArs: 3000 }),
      item({ key: "D", estado: "cortada", moneda: "USD", montoMensualArs: null }),
      item({ key: "E", oculta: true, aumento }),
      item({ key: "F", oculta: true, estado: "cortada", montoMensualArs: 7000 }),
    ]);
    expect(keys(sections.activas)).toEqual(["A", "B"]);
    expect(keys(sections.cortadas)).toEqual(["C", "D"]);
    expect(keys(sections.ocultas)).toEqual(["E", "F"]);
    expect(sections).toMatchObject({ subieron: 1, ahorroMensualArs: 3000, conUsd: true });
  });

  it("sin dólares activos no pide aclarar la cotización", () => {
    expect(subscriptionSections([item({ estado: "cortada", moneda: "USD" })]).conUsd).toBe(false);
  });

  it("sin suscripciones da secciones vacías", () => {
    expect(subscriptionSections([])).toEqual({
      activas: [], cortadas: [], ocultas: [], subieron: 0, ahorroMensualArs: 0, conUsd: false,
    });
  });
});

describe("textos de suscripciones", () => {
  it("increaseLabel describe el aumento con el mes en minúscula", () => {
    expect(increaseLabel(aumento)).toBe("Subió 10,0% desde marzo de 2026");
  });

  it("increaseShortLabel es la variación con signo", () => {
    expect(increaseShortLabel(aumento)).toBe("+10,0%");
  });

  it("increaseDetail e increaseSinceDetail muestran los montos en su moneda", () => {
    const detail = `${formatMoney(4990, "ARS")} → ${formatMoney(5490, "ARS")}`;
    expect(increaseDetail(aumento, 5490, "ARS")).toBe(detail);
    expect(increaseSinceDetail(aumento, 5490, "ARS")).toBe(`${detail} desde marzo de 2026`);
  });

  it("previousCurrencyLabel nombra la moneda anterior", () => {
    expect(previousCurrencyLabel("ARS")).toBe("Antes se cobraba en pesos");
    expect(previousCurrencyLabel("USD")).toBe("Antes se cobraba en dólares");
  });

  it("subscriptionMeta junta tarjeta y categoría", () => {
    expect(subscriptionMeta(item({}))).toBe("ICBC · Suscripciones");
  });

  it("AMOUNT_LABEL depende de la sección", () => {
    expect(AMOUNT_LABEL).toEqual({ activas: "Por mes", cortadas: "Último monto" });
  });

  it("activeCountLabel concuerda en número", () => {
    expect(activeCountLabel(1)).toBe("1 activa");
    expect(activeCountLabel(3)).toBe("3 activas");
  });

  it("monthlyKpiSub aclara los dólares según haya o no cotización", () => {
    const usd = formatMoney(12.99, "USD");
    expect(monthlyKpiSub(3, 0, 1465)).toBe("3 activas");
    expect(monthlyKpiSub(3, 12.99, 1465)).toBe(`3 activas · incluye ${usd} al oficial`);
    expect(monthlyKpiSub(1, 12.99, null)).toBe(`1 activa · sin cotización para ${usd}`);
  });
});

describe("subscriptionTransactionsLink", () => {
  it("lleva a Movimientos de todos los años buscando el comercio", () => {
    expect(subscriptionTransactionsLink("STREAMFLIX")).toBe("/transactions?year=all&search=STREAMFLIX");
  });

  it("escapa espacios y asteriscos sin perder la búsqueda", () => {
    const link = subscriptionTransactionsLink("GOOGLE *VideoP");
    expect(link).not.toContain(" ");
    expect(new URLSearchParams(link.split("?")[1]).get("search")).toBe("GOOGLE *VideoP");
  });
});

describe("textos de cadencia", () => {
  it("CADENCE_LABELS nombra cada cadencia", () => {
    expect(CADENCE_LABELS).toEqual({ mensual: "Mensual", bimestral: "Bimestral", anual: "Anual" });
  });

  it("cadenceMenuLabel nombra el comercio", () => {
    expect(cadenceMenuLabel("STREAMBOX")).toBe("Frecuencia de STREAMBOX");
  });

  it("cadenceMenuTooltip dice la cadencia actual", () => {
    expect(cadenceMenuTooltip("mensual")).toBe("Frecuencia: mensual");
    expect(cadenceMenuTooltip("bimestral")).toBe("Frecuencia: bimestral");
  });

  it("cadenceAmountCaption aclara las que no son mensuales", () => {
    expect(cadenceAmountCaption("anual")).toBe("por año");
    expect(cadenceAmountCaption("bimestral")).toBe("cada 2 meses");
    expect(cadenceAmountCaption("mensual")).toBeNull();
  });
});

describe("canMarkAsSubscription", () => {
  const purchase: TransactionDTO = {
    id: "t1", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-09-15",
    descriptionRaw: "VIDEOMAX 99123", merchant: "VIDEOMAX 99123", category: "Entretenimiento", categorySource: "rule",
    amount: 4500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
    installmentCurrent: null, installmentTotal: null, comprobante: null,
  };

  const NOT_ELIGIBLE: [string, Partial<TransactionDTO>][] = [
    ["una cuota", { isInstallment: true, installmentCurrent: 3, installmentTotal: 12 }],
    ["un crédito", { direction: "credit" }],
    ["un pago", { type: "payment", direction: "credit" }],
    ["un impuesto", { type: "tax" }],
    ["un monto en cero", { amount: 0 }],
  ];

  it("acepta un consumo en un pago, en pesos o en dólares", () => {
    expect(canMarkAsSubscription(purchase)).toBe(true);
    expect(canMarkAsSubscription({ ...purchase, currency: "USD" })).toBe(true);
  });

  it.each(NOT_ELIGIBLE)("rechaza %s", (_label, overrides) => {
    expect(canMarkAsSubscription({ ...purchase, ...overrides })).toBe(false);
  });
});
