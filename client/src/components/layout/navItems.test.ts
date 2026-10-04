import { describe, it, expect } from "vitest";
import { BAR_ITEMS, MORE_ITEMS, NAV_ITEMS, isMoreRoute } from "./navItems.js";

describe("secciones en mobile", () => {
  it("la barra lleva Dashboard, Cuotas, Movimientos e Importar, en ese orden", () => {
    expect(BAR_ITEMS.map((item) => item.to)).toEqual(["/", "/installments", "/transactions", "/import"]);
  });

  it("Dashboard se muestra como Inicio en la barra", () => {
    expect(BAR_ITEMS[0].shortLabel).toBe("Inicio");
  });

  it("«Más» lleva Créditos, Auto, Patrimonio, Sueldo, Vencimientos, Contexto, Flujo, Presupuestos, Suscripciones y Reglas", () => {
    expect(MORE_ITEMS.map((item) => item.label)).toEqual([
      "Créditos", "Auto", "Patrimonio", "Sueldo", "Vencimientos", "Contexto", "Flujo", "Presupuestos", "Suscripciones", "Reglas",
    ]);
  });

  it("en la sidebar, Suscripciones va después de Movimientos y las demás secciones nuevas antes", () => {
    expect(NAV_ITEMS.map((item) => item.to)).toEqual([
      "/", "/installments", "/credits", "/auto", "/patrimonio", "/sueldo", "/vencimientos", "/contexto", "/flujo",
      "/presupuestos", "/transactions", "/suscripciones", "/rules", "/import",
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
    for (const route of ["/patrimonio", "/vencimientos", "/flujo", "/presupuestos", "/suscripciones"]) {
      expect(isMoreRoute(route)).toBe(true);
    }
    expect(isMoreRoute("/")).toBe(false);
    expect(isMoreRoute("/transactions")).toBe(false);
    expect(isMoreRoute("/creditsx")).toBe(false);
  });
});
