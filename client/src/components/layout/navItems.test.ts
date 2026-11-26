import { describe, it, expect } from "vitest";
import {
  BAR_ITEMS, FOOTER_SECTIONS, MORE_GROUPS, MORE_ITEMS, NAV_GROUPS, NAV_ITEMS, NAV_SECTIONS,
  hasTabs, isMoreRoute, sectionOf, sectionPath, sectionTitle, type NavItem, type NavSection,
} from "./navItems.js";

const labelsOf = (items: NavItem[]): string[] => items.map((item) => item.label);

describe("grupos del menú", () => {
  it("separa Dashboard, el día a día, el largo plazo y Reglas", () => {
    expect(NAV_GROUPS.map(({ items }) => labelsOf(items))).toEqual([
      ["Dashboard"],
      ["Sueldo", "Vencimientos", "Flujo", "Suscripciones", "Servicios", "Movimientos"],
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
      ["Sueldo", "Vencimientos", "Flujo", "Suscripciones", "Servicios"],
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

  it("«Más» lleva Sueldo, Vencimientos, Flujo, Suscripciones, Servicios, Auto, Créditos, Patrimonio, Contexto y Reglas", () => {
    expect(labelsOf(MORE_ITEMS)).toEqual([
      "Sueldo", "Vencimientos", "Flujo", "Suscripciones", "Servicios", "Auto", "Créditos", "Patrimonio", "Contexto", "Reglas",
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
    for (const route of ["/patrimonio", "/vencimientos", "/flujo", "/suscripciones", "/servicios"]) {
      expect(isMoreRoute(route)).toBe(true);
    }
    expect(isMoreRoute("/")).toBe(false);
    expect(isMoreRoute("/transactions")).toBe(false);
    expect(isMoreRoute("/creditsx")).toBe(false);
    expect(isMoreRoute("/import")).toBe(false);
  });
});

const tabLabels = (section: NavSection): string[] => section.tabs.map((tab) => tab.label);
const ALL_SECTIONS = [...NAV_SECTIONS, ...FOOTER_SECTIONS];

describe("secciones del menú", () => {
  it("el riel lleva Inicio, Gastos, Ingresos, Deudas y Patrimonio, y Datos al pie", () => {
    expect(NAV_SECTIONS.map(({ label }) => label)).toEqual(["Inicio", "Gastos", "Ingresos", "Deudas", "Patrimonio"]);
    expect(FOOTER_SECTIONS.map(({ label }) => label)).toEqual(["Datos"]);
  });

  it("cada sección tiene sus solapas en orden", () => {
    expect(Object.fromEntries(ALL_SECTIONS.map((section) => [section.label, tabLabels(section)]))).toEqual({
      Inicio: ["Dashboard"],
      Gastos: ["Movimientos", "Suscripciones", "Servicios", "Vencimientos"],
      Ingresos: ["Sueldo", "Flujo"],
      Deudas: ["Créditos", "Auto"],
      Patrimonio: ["Patrimonio", "Contexto"],
      Datos: ["Importar", "Reglas"],
    });
  });

  it("cada ruta está en una sola sección y las ids no se repiten", () => {
    const routes = ALL_SECTIONS.flatMap(({ tabs }) => tabs.map(({ to }) => to));
    expect(routes).toHaveLength(13);
    expect(new Set(routes).size).toBe(13);
    expect(new Set(ALL_SECTIONS.map(({ id }) => id)).size).toBe(ALL_SECTIONS.length);
  });

  it("sectionOf encuentra la sección de cualquier solapa y nada fuera del menú", () => {
    expect(sectionOf("/")?.id).toBe("inicio");
    expect(sectionOf("/suscripciones")?.id).toBe("gastos");
    expect(sectionOf("/auto")?.id).toBe("deudas");
    expect(sectionOf("/rules")?.id).toBe("datos");
    expect(sectionOf("/installments")).toBeUndefined();
    expect(sectionOf("/creditsx")).toBeUndefined();
  });

  it("sectionPath lleva a la primera solapa", () => {
    expect(ALL_SECTIONS.map(sectionPath)).toEqual(["/", "/transactions", "/sueldo", "/credits", "/patrimonio", "/import"]);
  });

  it("el título es el nombre de la sección, salvo con una sola solapa", () => {
    expect(ALL_SECTIONS.map(sectionTitle)).toEqual(["Dashboard", "Gastos", "Ingresos", "Deudas", "Patrimonio", "Datos"]);
    expect(ALL_SECTIONS.map(hasTabs)).toEqual([false, true, true, true, true, true]);
  });
});
