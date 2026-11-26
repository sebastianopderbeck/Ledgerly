import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { SectionHeader } from "./SectionHeader.js";
import { sectionOf, type NavSection } from "./navItems.js";

const originalScrollIntoView = Element.prototype.scrollIntoView;
let restoreLayout = (): void => undefined;

afterEach(() => {
  cleanup();
  restoreLayout();
  restoreLayout = () => undefined;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const sectionAt = (pathname: string): NavSection => {
  const section = sectionOf(pathname);
  if (!section) throw new Error(`sin sección para ${pathname}`);
  return section;
};

const pills = (name: string) => screen.getByRole("navigation", { name: `secciones de ${name}` });

const PILL_WIDTH = 120;
const STRIP_WIDTH = 200;

const stubPillLayout = (): (() => void) => {
  const scrolled = new WeakMap<Element, number>();
  const stubs: PropertyDescriptorMap = {
    clientWidth: { configurable: true, get: () => STRIP_WIDTH },
    offsetWidth: { configurable: true, get: () => PILL_WIDTH },
    offsetLeft: {
      configurable: true,
      get(this: HTMLElement) {
        return Array.from(this.parentElement?.children ?? []).indexOf(this) * PILL_WIDTH;
      },
    },
    scrollLeft: {
      configurable: true,
      get(this: HTMLElement) {
        return scrolled.get(this) ?? 0;
      },
      set(this: HTMLElement, value: number) {
        scrolled.set(this, value);
      },
    },
  };
  const originals = Object.keys(stubs).map((name) => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const);
  Object.defineProperties(HTMLElement.prototype, stubs);
  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    }
  };
};

describe("SectionHeader", () => {
  it("en Gastos muestra el título y las cuatro solapas en orden", () => {
    renderWithProviders(<SectionHeader section={sectionAt("/suscripciones")} />, { route: "/suscripciones" });
    expect(screen.getByRole("heading", { level: 4, name: "Gastos" })).toBeInTheDocument();
    expect(within(pills("Gastos")).getAllByRole("link").map((link) => link.textContent))
      .toEqual(["Movimientos", "Suscripciones", "Servicios", "Vencimientos"]);
  });

  it("marca la solapa de la ruta actual", () => {
    renderWithProviders(<SectionHeader section={sectionAt("/suscripciones")} />, { route: "/suscripciones" });
    expect(within(pills("Gastos")).getByRole("link", { name: "Suscripciones" })).toHaveAttribute("aria-current", "page");
    expect(within(pills("Gastos")).getByRole("link", { name: "Movimientos" })).not.toHaveAttribute("aria-current");
  });

  it("las solapas conservan los filtros globales y descartan los de Movimientos", () => {
    renderWithProviders(<SectionHeader section={sectionAt("/transactions")} />, {
      route: "/transactions?year=2025&currency=USD&category=Compras&search=uber",
    });
    expect(within(pills("Gastos")).getByRole("link", { name: "Servicios" }))
      .toHaveAttribute("href", "/servicios?year=2025&currency=USD");
  });

  it("desliza la fila hasta la solapa marcada sin mover la página", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    restoreLayout = stubPillLayout();
    renderWithProviders(<SectionHeader section={sectionAt("/vencimientos")} />, { route: "/vencimientos" });
    const strip = within(pills("Gastos")).getByRole("link", { name: "Vencimientos" }).parentElement;
    expect(strip?.scrollLeft).toBe(280);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("Inicio se titula Dashboard y no tiene solapas", () => {
    renderWithProviders(<SectionHeader section={sectionAt("/")} />);
    expect(screen.getByRole("heading", { level: 4, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
