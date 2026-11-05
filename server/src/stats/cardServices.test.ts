import { describe, it, expect } from "vitest";
import {
  cardServiceGroups, cardServiceList, isCardServiceCharge, toCardServiceDTO, type CardServiceTx,
} from "./cardServices.js";

const cargo = (overrides: Partial<CardServiceTx> = {}): CardServiceTx => ({
  statementId: "s1",
  date: "2026-09-20",
  merchant: "GASCO",
  amount: 20_000,
  currency: "ARS",
  direction: "debit",
  type: "purchase",
  isInstallment: false,
  issuer: "visa_signature",
  cardLabel: "Visa Signature",
  ...overrides,
});

describe("isCardServiceCharge", () => {
  it("es una compra en pesos, en un pago y con monto positivo", () => {
    expect(isCardServiceCharge(cargo())).toBe(true);
    expect(isCardServiceCharge(cargo({ currency: "USD" }))).toBe(false);
    expect(isCardServiceCharge(cargo({ isInstallment: true }))).toBe(false);
    expect(isCardServiceCharge(cargo({ direction: "credit" }))).toBe(false);
    expect(isCardServiceCharge(cargo({ type: "refund" }))).toBe(false);
    expect(isCardServiceCharge(cargo({ amount: 0 }))).toBe(false);
  });
});

describe("cardServiceGroups", () => {
  it("solo cuenta compras en pesos, en un pago, del comercio marcado", () => {
    const valido = cargo();
    const txs = [
      valido,
      cargo({ currency: "USD", date: "2026-09-21" }),
      cargo({ isInstallment: true, date: "2026-09-22" }),
      cargo({ direction: "credit", date: "2026-09-23" }),
      cargo({ merchant: "OTRO COMERCIO", date: "2026-09-24" }),
    ];
    expect(cardServiceGroups(txs, new Set(["GASCO"]))).toEqual([{ key: "GASCO", charges: [valido] }]);
  });

  it("una marca en una variante del nombre vale para todo el grupo", () => {
    const truncado = cargo({ merchant: "CAFE SERVIC", date: "2026-08-20" });
    const completo = cargo({ merchant: "CAFE SERVICIO", date: "2026-09-20" });
    expect(cardServiceGroups([completo, truncado], new Set(["CAFE SERVICIO"])))
      .toEqual([{ key: "CAFE SERVIC", charges: [truncado, completo] }]);
  });

  it("sin marca no hay servicios", () => {
    expect(cardServiceGroups([cargo()], new Set())).toEqual([]);
  });
});

describe("toCardServiceDTO", () => {
  it("el último monto suma los cargos del resumen más reciente", () => {
    const group = {
      key: "GASCO",
      charges: [
        cargo({ date: "2026-08-20", amount: 18_000, statementId: "s1", cardLabel: "Visa vieja" }),
        cargo({ date: "2026-09-05", amount: 9_000, statementId: "s2" }),
        cargo({ date: "2026-09-20", amount: 11_000.5, statementId: "s2", merchant: "GASCO 1234" }),
      ],
    };
    expect(toCardServiceDTO(group)).toEqual({
      key: "GASCO",
      nombre: "GASCO",
      issuer: "visa_signature",
      cardLabel: "Visa Signature",
      ultimoMonto: 20_000.5,
      ultimoCargo: "2026-09-20",
    });
  });
});

describe("cardServiceList", () => {
  it("la lista sale ordenada por nombre", () => {
    const groups = [
      { key: "LUZCO", charges: [cargo({ merchant: "LUZCO" })] },
      { key: "AGUACO", charges: [cargo({ merchant: "AGUACO" })] },
    ];
    expect(cardServiceList(groups).map(({ nombre }) => nombre)).toEqual(["AGUACO", "LUZCO"]);
  });
});
