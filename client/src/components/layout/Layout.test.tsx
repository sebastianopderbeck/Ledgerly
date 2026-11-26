import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Link } from "react-router-dom";
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

const moreSheet = () => screen.queryByRole("dialog", { name: "Más secciones" });

describe("Layout en mobile", () => {
  beforeEach(() => emulateMobile());

  const moreButton = () => within(mainNavigation()).getByRole("button", { name: "Más" });

  it("la barra inferior muestra Inicio, Movimientos y Más", () => {
    renderLayout();
    const links = within(mainNavigation()).getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Inicio", "Movimientos"]);
    expect(moreButton()).toBeInTheDocument();
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

  it("marca la sección actual de la barra y deja «Más» sin marcar", () => {
    renderLayout("/transactions");
    expect(within(mainNavigation()).getByRole("link", { name: "Movimientos" })).toHaveAttribute("aria-current", "page");
    expect(moreButton()).not.toHaveAttribute("aria-current");
  });

  it("en una sección de «Más», marca «Más» como actual", () => {
    renderLayout("/credits");
    expect(moreButton()).toHaveAttribute("aria-current", "page");
    expect(within(mainNavigation()).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("los links de la barra conservan los filtros globales y descartan los de Movimientos", () => {
    renderLayout("/transactions?year=2025&currency=USD&category=Compras");
    expect(within(mainNavigation()).getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "/?year=2025&currency=USD");
  });

  it("«Más» abre el resto de las secciones y la hoja se cierra al elegir una", async () => {
    renderLayout();
    fireEvent.click(moreButton());
    const sheet = screen.getByRole("dialog", { name: "Más secciones" });
    fireEvent.click(within(sheet).getByRole("link", { name: "Sueldo" }));
    await waitFor(() => expect(moreSheet()).not.toBeInTheDocument());
    expect(moreButton()).toHaveAttribute("aria-current", "page");
  });

  it("si la ruta cambia con «Más» abierto (gesto de volver), la hoja se cierra", async () => {
    renderWithProviders(<Layout><Link to="/auto">ir a auto</Link></Layout>);
    fireEvent.click(moreButton());
    expect(moreSheet()).toBeInTheDocument();
    fireEvent.click(screen.getByText("ir a auto"));
    await waitFor(() => expect(moreSheet()).not.toBeInTheDocument());
  });

  it("con teclado, «Más» indica si está abierto y el foco vuelve a él al cerrar con Escape", async () => {
    renderLayout();
    const more = moreButton();
    expect(more).toHaveAttribute("aria-haspopup", "dialog");
    expect(more).toHaveAttribute("aria-expanded", "false");
    more.focus();
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Más secciones" }), { key: "Escape" });
    await waitFor(() => expect(more).toHaveFocus());
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("si la pantalla pasa a tamaño compu con «Más» abierto, no queda nada tapando la app", async () => {
    renderLayout();
    fireEvent.click(moreButton());
    emulateDesktop();
    await waitFor(() => expect(moreSheet()).not.toBeInTheDocument());
    expect(document.querySelector(".MuiBackdrop-root")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(screen.getByRole("link", { name: "Datos" })).toBeInTheDocument();
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
