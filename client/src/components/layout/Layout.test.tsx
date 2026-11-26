import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { Layout } from "./Layout.js";

const renderLayout = (route = "/") => renderWithProviders(<Layout><div>contenido</div></Layout>, { route });

const mainNavigation = () => screen.getByRole("navigation", { name: /principal/i });

const quickActions = () => screen.getByRole("group", { name: /acciones rápidas/i });

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Layout", () => {
  it("el riel muestra cada sección con su nombre y Datos al pie, separado por una línea", () => {
    renderLayout();
    expect(within(mainNavigation()).getAllByRole("link").map((link) => link.textContent))
      .toEqual(["Inicio", "Gastos", "Ingresos", "Deudas", "Patrimonio", "Datos"]);
    expect(within(mainNavigation()).getAllByRole("separator")).toHaveLength(1);
  });

  it("cada entrada lleva a su primera solapa con los filtros globales", () => {
    renderLayout("/transactions?year=2025&currency=USD&category=Compras&search=uber");
    const hrefs = within(mainNavigation()).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      ["/", "/transactions", "/sueldo", "/credits", "/patrimonio", "/import"].map((path) => `${path}?year=2025&currency=USD`),
    );
  });

  it("marca la sección de la ruta aunque no sea su primera solapa", () => {
    renderLayout("/auto");
    expect(within(mainNavigation()).getByRole("link", { name: "Deudas" })).toHaveAttribute("aria-current", "page");
    expect(within(mainNavigation()).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("fuera del menú ninguna entrada del riel queda marcada", () => {
    renderLayout("/installments");
    expect(within(mainNavigation()).getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(0);
  });

  it("arriba de la página muestra la sección de la ruta con sus solapas", () => {
    renderLayout("/flujo");
    expect(screen.getByRole("heading", { level: 4, name: "Ingresos" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "secciones de Ingresos" })).getByRole("link", { name: "Flujo" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("importar desde la pill abre Datos con Importar marcada", () => {
    renderLayout("/import");
    expect(screen.getByRole("heading", { level: 4, name: "Datos" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "secciones de Datos" })).getByRole("link", { name: "Importar" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("fuera del menú no muestra encabezado de sección", () => {
    renderLayout("/installments");
    expect(screen.queryByRole("heading", { level: 4 })).not.toBeInTheDocument();
  });

  it("agrupa importar, actualizar datos y cambiar tema en las acciones rápidas", () => {
    renderLayout();
    expect(within(quickActions()).getByRole("link", { name: "importar" })).toBeInTheDocument();
    expect(within(quickActions()).getByLabelText("actualizar datos")).toBeInTheDocument();
    expect(within(quickActions()).getByLabelText("cambiar tema")).toBeInTheDocument();
  });

  it("importar no está en la navegación principal", () => {
    renderLayout();
    expect(within(mainNavigation()).queryByRole("link", { name: /importar/i })).not.toBeInTheDocument();
  });

  it("importar conserva los filtros globales y se marca activo en su ruta", () => {
    renderLayout("/import?year=2025&currency=USD&category=Compras");
    const importLink = within(quickActions()).getByRole("link", { name: "importar" });
    expect(importLink).toHaveAttribute("href", "/import?year=2025&currency=USD");
    expect(importLink).toHaveAttribute("aria-current", "page");
  });

  it("en compu no muestra la barra inferior", () => {
    emulateDesktop();
    renderLayout();
    expect(screen.queryByRole("button", { name: "Más" })).not.toBeInTheDocument();
    expect(within(mainNavigation()).getByRole("link", { name: "Datos" })).toBeInTheDocument();
  });
});

const cssFor = (element: Element): string => {
  const classes = Array.from(element.classList).filter((name) => name.startsWith("css-"));
  const rules = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n")
    .split("}");
  return rules.filter((rule) => classes.some((name) => rule.includes(`.${name}`))).join("}");
};

describe("Layout en mobile", () => {
  beforeEach(() => emulateMobile());

  it("la barra muestra Inicio, Gastos, Ingresos, Deudas y Patrimonio, sin «Más»", () => {
    renderLayout();
    expect(within(mainNavigation()).getAllByRole("link").map((link) => link.textContent))
      .toEqual(["Inicio", "Gastos", "Ingresos", "Deudas", "Patrimonio"]);
    expect(within(mainNavigation()).queryByRole("button", { name: "Más" })).not.toBeInTheDocument();
  });

  it("importar sigue a mano en las acciones rápidas", () => {
    renderLayout();
    expect(within(quickActions()).getByRole("link", { name: "importar" })).toBeInTheDocument();
  });

  it("no monta la sidebar de compu", () => {
    renderLayout();
    expect(within(mainNavigation()).queryByRole("link", { name: "Datos" })).not.toBeInTheDocument();
    expect(within(quickActions()).queryByLabelText("abrir menú")).not.toBeInTheDocument();
  });

  it("marca la sección de la ruta actual", () => {
    renderLayout("/suscripciones");
    expect(within(mainNavigation()).getByRole("link", { name: "Gastos" })).toHaveAttribute("aria-current", "page");
    expect(within(mainNavigation()).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("en Datos ninguna entrada de la barra queda marcada", () => {
    renderLayout("/rules");
    expect(within(mainNavigation()).getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(0);
  });

  it("los links de la barra conservan los filtros globales y descartan los de Movimientos", () => {
    renderLayout("/transactions?year=2025&currency=USD&category=Compras");
    expect(within(mainNavigation()).getByRole("link", { name: "Gastos" })).toHaveAttribute("href", "/transactions?year=2025&currency=USD");
  });

  it("la barra, el contenido y la pill reservan la zona segura del iPhone", () => {
    renderLayout();
    expect(cssFor(mainNavigation())).toContain("env(safe-area-inset-bottom)");
    expect(cssFor(screen.getByRole("main").firstElementChild!)).toContain("env(safe-area-inset-bottom)");
    expect(cssFor(quickActions())).toContain("env(safe-area-inset-top)");
  });

  it("la franja de la barra de estado es oscura también en modo claro", () => {
    localStorage.setItem("ledgerly.colorMode", JSON.stringify("light"));
    renderLayout();
    const scrim = Array.from(document.querySelectorAll("[aria-hidden]")).find(
      (element) => cssFor(element).includes("height:env(safe-area-inset-top)"),
    );
    expect(scrim).toBeDefined();
    expect(cssFor(scrim!)).toMatch(/background-color:\s*#0b0f19/i);
  });
});
