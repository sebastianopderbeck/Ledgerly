import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Link } from "react-router-dom";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { Layout } from "./Layout.js";
import { NAV_ITEMS } from "./navItems.js";

const SECTIONS = [
  /dashboard/i, /cuotas/i, /créditos/i, /auto/i, /patrimonio/i, /sueldo/i, /vencimientos/i, /contexto/i, /flujo/i,
  /presupuestos/i, /movimientos/i, /suscripciones/i, /reglas/i, /importar/i,
];

const renderLayout = (route = "/") => renderWithProviders(<Layout><div>contenido</div></Layout>, { route });

const mainNavigation = () => screen.getByRole("navigation", { name: /principal/i });

const quickActions = () => screen.getByRole("group", { name: /acciones rápidas/i });

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Layout", () => {
  it("muestra cada sección como link dentro de la navegación principal", () => {
    renderLayout();
    for (const name of SECTIONS) {
      expect(within(mainNavigation()).getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("todos los links conservan los filtros globales y descartan los de Movimientos", () => {
    renderLayout("/transactions?year=2025&currency=USD&category=Compras&search=uber");
    for (const { to, label } of NAV_ITEMS) {
      const link = within(mainNavigation()).getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", `${to}?year=2025&currency=USD`);
    }
  });

  it("marca como activa solo la sección de la ruta actual", () => {
    renderLayout("/credits");
    expect(screen.getByRole("link", { name: /créditos/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /dashboard/i })).not.toHaveAttribute("aria-current");
  });

  it("agrupa actualizar datos y cambiar tema en las acciones rápidas", () => {
    renderLayout();
    expect(within(quickActions()).getByLabelText("actualizar datos")).toBeInTheDocument();
    expect(within(quickActions()).getByLabelText("cambiar tema")).toBeInTheDocument();
  });

  it("colapsar la sidebar oculta los textos pero mantiene los links accesibles", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "colapsar menú" }));

    expect(screen.queryByText("Movimientos")).not.toBeInTheDocument();
    expect(within(mainNavigation()).getByRole("link", { name: /movimientos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "expandir menú" })).toBeInTheDocument();
  });

  it("expandir la sidebar vuelve a mostrar los textos", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "colapsar menú" }));
    fireEvent.click(screen.getByRole("button", { name: "expandir menú" }));

    expect(screen.getByText("Movimientos")).toBeInTheDocument();
  });

  it("recuerda la sidebar colapsada al volver a abrir la app", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "colapsar menú" }));
    cleanup();

    renderLayout();

    expect(screen.getByRole("button", { name: "expandir menú" })).toBeInTheDocument();
    expect(screen.queryByText("Movimientos")).not.toBeInTheDocument();
  });

  it("en compu no muestra la barra inferior", () => {
    emulateDesktop();
    renderLayout();
    expect(screen.queryByRole("button", { name: "Más" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "colapsar menú" })).toBeInTheDocument();
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

  it("la barra inferior muestra Inicio, Cuotas, Movimientos, Importar y Más", () => {
    renderLayout();
    const links = within(mainNavigation()).getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual(["Inicio", "Cuotas", "Movimientos", "Importar"]);
    expect(moreButton()).toBeInTheDocument();
  });

  it("no monta la sidebar de compu", () => {
    renderLayout();
    expect(screen.queryByRole("button", { name: "colapsar menú" })).not.toBeInTheDocument();
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
    expect(within(mainNavigation()).getByRole("link", { name: "Cuotas" })).toHaveAttribute("href", "/installments?year=2025&currency=USD");
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
    expect(screen.getByRole("button", { name: "colapsar menú" })).toBeInTheDocument();
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
