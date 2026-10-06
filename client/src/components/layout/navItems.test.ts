import { describe, it, expect } from "vitest";
import { BAR_ITEMS, MORE_GROUPS, MORE_ITEMS, NAV_GROUPS, NAV_ITEMS, isMoreRoute, type NavItem } from "./navItems.js";

const labelsOf = (items: NavItem[]): string[] => items.map((item) => item.label);

describe("grupos del menú", () => {
  it("separa Dashboard, el día a día, el largo plazo y Reglas", () => {
    expect(NAV_GROUPS.map(({ items }) => labelsOf(items))).toEqual([
      ["Dashboard"],
      ["Sueldo", "Vencimientos", "Flujo", "Suscripciones", "Movimientos"],
      ["Auto", "Créditos", "Patrimonio", "Contexto"],
      ["Reglas"],
    ]);
  });

  it("cada grupo tiene un id propio", () => {
    const ids = NAV_GROUPS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("la sidebar recorre los grupos en orden", () => {
    expect(NAV_ITEMS).toEqual(NAV_GROUPS.flatMap(({ items }) => items));
  });

  it("«Más» conserva los grupos que tienen secciones de «Más»", () => {
    expect(MORE_GROUPS.map(({ items }) => labelsOf(items))).toEqual([
      ["Sueldo", "Vencimientos", "Flujo", "Suscripciones"],
      ["Auto", "Créditos", "Patrimonio", "Contexto"],
      ["Reglas"],
    ]);
  });
});

describe("secciones en mobile", () => {
  it("la barra lleva Dashboard y Movimientos, en ese orden", () => {
    expect(BAR_ITEMS.map((item) => item.to)).toEqual(["/", "/transactions"]);
  });

  it("Dashboard se muestra como Inicio en la barra", () => {
    expect(BAR_ITEMS[0].shortLabel).toBe("Inicio");
  });

  it("«Más» lleva Sueldo, Vencimientos, Flujo, Suscripciones, Auto, Créditos, Patrimonio, Contexto y Reglas", () => {
    expect(labelsOf(MORE_ITEMS)).toEqual([
      "Sueldo", "Vencimientos", "Flujo", "Suscripciones", "Auto", "Créditos", "Patrimonio", "Contexto", "Reglas",
    ]);
  });

  it("entre la barra y «Más» están todas las secciones, sin repetir", () => {
    const placed = [...BAR_ITEMS, ...MORE_ITEMS].map((item) => item.to).sort();
    expect(placed).toEqual(NAV_ITEMS.map((item) => item.to).sort());
    expect(new Set(placed).size).toBe(NAV_ITEMS.length);
  });

  it("isMoreRoute reconoce solo las rutas de «Más»", () => {
    expect(isMoreRoute("/credits")).toBe(true);
    expect(isMoreRoute("/rules")).toBe(true);
    for (const route of ["/patrimonio", "/vencimientos", "/flujo", "/suscripciones"]) {
      expect(isMoreRoute(route)).toBe(true);
    }
    expect(isMoreRoute("/")).toBe(false);
    expect(isMoreRoute("/transactions")).toBe(false);
    expect(isMoreRoute("/creditsx")).toBe(false);
    expect(isMoreRoute("/import")).toBe(false);
  });
});
