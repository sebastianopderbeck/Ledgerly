import { describe, it, expect } from "vitest";
import type { InboxRuleResultDTO, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import {
  INBOX_PREVIEW_SIZE, MIN_RULE_PATTERN_LENGTH, checkPattern, groupCaption, groupTotalLabel, inboxRuleFeedback,
  inboxSummary, inboxTransactionsHref, missingUsdRate, pendingLabel, sortInboxGroups,
} from "./uncategorizedInbox.js";

const group = (overrides: Partial<UncategorizedGroupDTO>): UncategorizedGroupDTO => ({
  pattern: "KIOSCO EL SOL", merchants: ["KIOSCO EL SOL"], count: 1, totalArs: 0, totalUsd: 0, equivalentArs: 0,
  lastDate: "2026-09-01", ...overrides,
});

const panaderia = group({
  pattern: "PANADERIA LA ESPIGA", merchants: ["PANADERIA LA ESPIGA"], count: 6, totalArs: 21400, equivalentArs: 21400,
  lastDate: "2026-09-28",
});
const panaderiaCentro = group({
  pattern: "PANADERIA CENTRO", merchants: ["PANADERIA CENTRO"], count: 1, totalArs: 21400, equivalentArs: 21400,
});
const kiosco = group({ count: 6, totalArs: 9000, equivalentArs: 9000 });
const steam = group({
  pattern: "STEAMGAMES.COM", merchants: ["STEAMGAMES.COM 4259522985", "STEAMGAMES.COM 4259518112"], count: 2,
  totalUsd: 19.98, equivalentArs: 28271.7, lastDate: "2026-09-14",
});

const inboxOf = (usdRate: number | null, groups: UncategorizedGroupDTO[]): UncategorizedInboxDTO =>
  ({ pendingCount: groups.length, usdRate, groups });

const created = (categorized: number): InboxRuleResultDTO => ({
  rule: { id: "r1", priority: 100, matchType: "contains", pattern: "PANADERIA", category: "Comida", source: "user", enabled: true },
  categorized,
});

describe("constantes", () => {
  it("el patrón pide 3 caracteres y la bandeja muestra 8 comercios", () => {
    expect(MIN_RULE_PATTERN_LENGTH).toBe(3);
    expect(INBOX_PREVIEW_SIZE).toBe(8);
  });
});

describe("sortInboxGroups", () => {
  const groups = [kiosco, panaderiaCentro, steam, panaderia];

  it("por monto: equivalente en pesos, después cantidad", () => {
    expect(sortInboxGroups(groups, "amount").map((item) => item.pattern))
      .toEqual(["STEAMGAMES.COM", "PANADERIA LA ESPIGA", "PANADERIA CENTRO", "KIOSCO EL SOL"]);
  });

  it("por frecuencia: cantidad, después equivalente en pesos", () => {
    expect(sortInboxGroups(groups, "count").map((item) => item.pattern))
      .toEqual(["PANADERIA LA ESPIGA", "KIOSCO EL SOL", "STEAMGAMES.COM", "PANADERIA CENTRO"]);
  });

  it("con todo empatado ordena por patrón", () => {
    const beta = group({ pattern: "BETA", merchants: ["BETA"] });
    const alfa = group({ pattern: "ALFA", merchants: ["ALFA"] });
    expect(sortInboxGroups([beta, alfa], "amount").map((item) => item.pattern)).toEqual(["ALFA", "BETA"]);
    expect(sortInboxGroups([beta, alfa], "count").map((item) => item.pattern)).toEqual(["ALFA", "BETA"]);
  });

  it("no muta la lista recibida", () => {
    const original = [kiosco, steam];
    sortInboxGroups(original, "amount");
    expect(original).toEqual([kiosco, steam]);
  });
});

describe("checkPattern", () => {
  const groups = [panaderia, panaderiaCentro, kiosco, steam];

  it("pide al menos 3 caracteres", () => {
    expect(checkPattern(" PA ", panaderia, groups)).toEqual({ valid: false, hint: "Mínimo 3 caracteres" });
  });

  it("avisa si el patrón ya no coincide con el comercio", () => {
    expect(checkPattern("KIOSCO", panaderia, groups)).toEqual({ valid: false, hint: "No coincide con «PANADERIA LA ESPIGA»" });
  });

  it("avisa cuántos comercios más de la bandeja cubre", () => {
    expect(checkPattern("PANADERIA", panaderia, groups))
      .toEqual({ valid: true, hint: "También cubre 1 comercio más de la bandeja" });
    const norte = group({ pattern: "PANADERIA NORTE", merchants: ["PANADERIA NORTE"] });
    expect(checkPattern("PANADERIA", panaderia, [...groups, norte]))
      .toEqual({ valid: true, hint: "También cubre 2 comercios más de la bandeja" });
  });

  it("sin otros comercios cubiertos no hay aviso", () => {
    expect(checkPattern("PANADERIA LA ESPIGA", panaderia, groups)).toEqual({ valid: true, hint: null });
  });

  it("matchea contra cualquier variante del grupo", () => {
    expect(checkPattern("4259518112", steam, groups)).toEqual({ valid: true, hint: null });
  });

  it("acepta el patrón en minúsculas y con espacios alrededor", () => {
    expect(checkPattern("  panaderia la  ", panaderia, groups)).toEqual({ valid: true, hint: null });
  });
});

describe("inboxSummary y pendingLabel", () => {
  it("cuentan en plural y en singular", () => {
    expect(inboxSummary(23, 9)).toBe("23 movimientos en 9 comercios");
    expect(inboxSummary(1, 1)).toBe("1 movimiento en 1 comercio");
    expect(pendingLabel(8)).toBe("8 movimientos pendientes");
    expect(pendingLabel(1)).toBe("1 movimiento pendiente");
    expect(pendingLabel(0)).toBe("0 movimientos pendientes");
  });
});

describe("groupTotalLabel", () => {
  it("muestra los montos no nulos de cada moneda", () => {
    expect(groupTotalLabel(group({ totalArs: 9000 }))).toBe(formatMoney(9000, "ARS"));
    expect(groupTotalLabel(group({ totalUsd: 10 }))).toBe(formatMoney(10, "USD"));
    expect(groupTotalLabel(group({ totalArs: 9000, totalUsd: 10 }))).toBe(`${formatMoney(9000, "ARS")} · ${formatMoney(10, "USD")}`);
  });

  it("sin montos muestra cero pesos", () => {
    expect(groupTotalLabel(group({}))).toBe(formatMoney(0, "ARS"));
  });
});

describe("groupCaption", () => {
  it("cuenta los movimientos, la fecha del último y las variantes", () => {
    expect(groupCaption(panaderia)).toBe("6 movimientos · último 2026-09-28");
    expect(groupCaption(steam)).toBe("2 movimientos · último 2026-09-14 · 2 variantes");
    expect(groupCaption(group({}))).toBe("1 movimiento · último 2026-09-01");
  });
});

describe("missingUsdRate", () => {
  it("avisa solo si falta la cotización y hay montos en USD", () => {
    expect(missingUsdRate(inboxOf(null, [panaderia, steam]))).toBe(true);
    expect(missingUsdRate(inboxOf(null, [panaderia]))).toBe(false);
    expect(missingUsdRate(inboxOf(1415, [steam]))).toBe(false);
  });
});

describe("inboxTransactionsHref", () => {
  it("lleva a Movimientos de todos los años, sin categoría y con el patrón", () => {
    expect(inboxTransactionsHref("PANADERIA LA ESPIGA"))
      .toBe("/transactions?year=all&category=Sin+categor%C3%ADa&search=PANADERIA+LA+ESPIGA");
    expect(inboxTransactionsHref("UBER *TRIP")).toBe("/transactions?year=all&category=Sin+categor%C3%ADa&search=UBER+*TRIP");
  });
});

describe("inboxRuleFeedback", () => {
  it("cuenta lo categorizado en plural y en singular", () => {
    expect(inboxRuleFeedback(created(6)))
      .toEqual({ severity: "success", message: "Regla «PANADERIA» → Comida: 6 movimientos categorizados." });
    expect(inboxRuleFeedback(created(1)))
      .toEqual({ severity: "success", message: "Regla «PANADERIA» → Comida: 1 movimiento categorizado." });
  });

  it("avisa si la regla no categorizó nada", () => {
    expect(inboxRuleFeedback(created(0))).toEqual({
      severity: "info",
      message: "Regla «PANADERIA» → Comida creada, pero no coincidió con ningún movimiento pendiente.",
    });
  });
});
