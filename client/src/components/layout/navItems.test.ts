import { describe, it, expect } from "vitest";
import { FOOTER_SECTIONS, NAV_SECTIONS, hasTabs, sectionOf, sectionPath, sectionTitle, type NavSection } from "./navItems.js";

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
