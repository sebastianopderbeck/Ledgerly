import { describe, it, expect } from "vitest";
import type { Currency } from "@ledgerly/shared";
import { buildUncategorizedInbox, type PendingPurchase } from "./uncategorizedInbox.js";

const purchase = (merchant: string, amount: number, date: string, currency: Currency = "ARS"): PendingPurchase =>
  ({ merchant, amount, currency, date });

describe("buildUncategorizedInbox", () => {
  it("junta en un grupo las variantes con referencias distintas", () => {
    const inbox = buildUncategorizedInbox([
      purchase("STEAMGAMES.COM 4259522985", 9.99, "2026-09-14", "USD"),
      purchase("STEAMGAMES.COM 4259518112", 9.99, "2026-08-14", "USD"),
    ], 1415);
    expect(inbox.groups).toHaveLength(1);
    expect(inbox.groups[0]).toMatchObject({ pattern: "STEAMGAMES.COM", count: 2, totalArs: 0, lastDate: "2026-09-14" });
    expect(inbox.groups[0].merchants).toEqual(["STEAMGAMES.COM 4259518112", "STEAMGAMES.COM 4259522985"]);
    expect(inbox.groups[0].totalUsd).toBeCloseTo(19.98);
    expect(inbox.groups[0].equivalentArs).toBeCloseTo(28271.7);
  });

  it("suma por moneda, convierte los USD con la cotización y toma la fecha más reciente", () => {
    const inbox = buildUncategorizedInbox([
      purchase("KIOSCO EL SOL", 1000, "2026-09-01"),
      purchase("KIOSCO EL SOL", 500, "2026-09-03"),
      purchase("KIOSCO EL SOL", 2, "2026-09-02", "USD"),
    ], 1000);
    expect(inbox.groups[0]).toMatchObject({ count: 3, totalArs: 1500, totalUsd: 2, equivalentArs: 3500, lastDate: "2026-09-03" });
  });

  it("sin cotización los USD no suman al equivalente", () => {
    const inbox = buildUncategorizedInbox([
      purchase("KIOSCO EL SOL", 1000, "2026-09-01"),
      purchase("KIOSCO EL SOL", 2, "2026-09-02", "USD"),
    ], null);
    expect(inbox.usdRate).toBeNull();
    expect(inbox.groups[0]).toMatchObject({ totalArs: 1000, totalUsd: 2, equivalentArs: 1000 });
  });

  it("ordena por equivalente en pesos, después por cantidad y después por patrón", () => {
    const inbox = buildUncategorizedInbox([
      purchase("ALFA", 100, "2026-09-01"),
      purchase("BETA", 50, "2026-09-01"),
      purchase("BETA", 50, "2026-09-02"),
      purchase("GAMMA", 100, "2026-09-01"),
      purchase("DELTA", 300, "2026-09-01"),
      purchase("EPSILON", 1, "2026-09-01", "USD"),
    ], 250);
    expect(inbox.groups.map((group) => group.pattern)).toEqual(["DELTA", "EPSILON", "BETA", "ALFA", "GAMMA"]);
  });

  it("ordena las variantes de la más frecuente a la menos", () => {
    const inbox = buildUncategorizedInbox([
      purchase("YPF 1234", 10, "2026-09-01"),
      purchase("YPF 5678", 10, "2026-09-02"),
      purchase("YPF 5678", 10, "2026-09-03"),
    ], null);
    expect(inbox.groups[0]).toMatchObject({ pattern: "YPF", merchants: ["YPF 5678", "YPF 1234"] });
  });

  it("cuenta todos los pendientes", () => {
    expect(buildUncategorizedInbox([purchase("ALFA", 1, "2026-09-01"), purchase("BETA", 1, "2026-09-01")], null).pendingCount).toBe(2);
  });

  it("sin filas devuelve una bandeja vacía con la cotización", () => {
    expect(buildUncategorizedInbox([], 1415)).toEqual({ pendingCount: 0, usdRate: 1415, groups: [] });
  });
});
