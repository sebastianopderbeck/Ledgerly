import { describe, it, expect } from "vitest";
import { categorize, idsMatchingRule, matchRule, SEED_RULES, UNCATEGORIZED } from "./categorize.js";
import type { RuleCandidate, RuleInput } from "./categorize.js";

const rules: RuleInput[] = [
  { priority: 1, matchType: "contains", pattern: "NETFLIX", category: "Suscripciones", enabled: true },
  { priority: 2, matchType: "regex", pattern: "SUBE|UBER", category: "Transporte", enabled: true },
  { priority: 3, matchType: "contains", pattern: "DISABLED", category: "Nunca", enabled: false },
];

describe("categorize", () => {
  it("matchea 'contains' sin importar mayúsculas", () => {
    expect(categorize("NETFLIX.COM 12345", "NETFLIX.COM", rules)).toEqual({ category: "Suscripciones", source: "rule" });
  });
  it("matchea 'regex'", () => {
    expect(categorize("SUBE VIAJES - BUSES", "SUBE VIAJES", rules)).toEqual({ category: "Transporte", source: "rule" });
  });
  it("ignora reglas deshabilitadas y cae en Sin categoría", () => {
    expect(categorize("DISABLED COMERCIO", "DISABLED", rules)).toEqual({ category: "Sin categoría", source: "rule" });
  });
  it("respeta la prioridad (menor primero)", () => {
    const r: RuleInput[] = [
      { priority: 5, matchType: "contains", pattern: "CAFE", category: "B", enabled: true },
      { priority: 1, matchType: "contains", pattern: "CAFE", category: "A", enabled: true },
    ];
    expect(categorize("BICHO CAFE", "BICHO CAFE", r).category).toBe("A");
  });
});

describe("matchRule", () => {
  it("devuelve la categoría de la primera regla que matchea (por prioridad)", () => {
    expect(matchRule("NETFLIX.COM 1", "NETFLIX.COM", rules)).toBe("Suscripciones");
  });
  it("devuelve null si ninguna matchea", () => {
    expect(matchRule("PANADERIA LA REAL", "PANADERIA", rules)).toBeNull();
  });
  it("un regex inválido no rompe (esa regla no matchea)", () => {
    const bad: RuleInput[] = [{ priority: 1, matchType: "regex", pattern: "(", category: "X", enabled: true }];
    expect(matchRule("HOLA", "HOLA", bad)).toBeNull();
  });
});

describe("SEED_RULES", () => {
  it("trae reglas de sistema con categoría", () => {
    expect(SEED_RULES.length).toBeGreaterThan(3);
    expect(SEED_RULES.every((r) => r.category && r.pattern)).toBe(true);
  });
});

describe("UNCATEGORIZED", () => {
  it("es la categoría de los movimientos sin regla", () => {
    expect(UNCATEGORIZED).toBe("Sin categoría");
    expect(categorize("ALGO RARO", "ALGO RARO", []).category).toBe(UNCATEGORIZED);
  });
});

describe("idsMatchingRule", () => {
  const candidates: RuleCandidate[] = [
    { id: "a", descriptionRaw: "PANADERIA LA ESPIGA 123", merchant: "PANADERIA LA ESPIGA" },
    { id: "b", descriptionRaw: "MERPAGO*KIOSCO EL SOL", merchant: "KIOSCO EL SOL" },
    { id: "c", descriptionRaw: "UBER *TRIP HELP.UBER.COM", merchant: "UBER *TRIP HELP.UBER.COM" },
  ];
  const contains = (pattern: string): RuleInput => ({ priority: 100, matchType: "contains", pattern, category: "Comida", enabled: true });

  it("matchea por el comercio sin importar mayúsculas", () => {
    expect(idsMatchingRule(candidates, contains("panaderia la"))).toEqual(["a"]);
  });

  it("matchea también por la descripción cruda", () => {
    expect(idsMatchingRule(candidates, contains("MERPAGO*"))).toEqual(["b"]);
  });

  it("en contains los caracteres de regex valen literal", () => {
    expect(idsMatchingRule(candidates, contains("UBER *TRIP"))).toEqual(["c"]);
    expect(idsMatchingRule(candidates, contains("UBER.*SOL"))).toEqual([]);
  });

  it("sin coincidencias devuelve una lista vacía", () => {
    expect(idsMatchingRule(candidates, contains("FARMACIA"))).toEqual([]);
  });

  it("un regex inválido no matchea nada", () => {
    expect(idsMatchingRule(candidates, { ...contains("("), matchType: "regex" })).toEqual([]);
  });
});
