import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { SectionHeader } from "./SectionHeader.js";
import { sectionOf, type NavSection } from "./navItems.js";

afterEach(cleanup);

const sectionAt = (pathname: string): NavSection => {
  const section = sectionOf(pathname);
  if (!section) throw new Error(`sin sección para ${pathname}`);
  return section;
};

const pills = (name: string) => screen.getByRole("navigation", { name: `secciones de ${name}` });

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

  it("Inicio se titula Dashboard y no tiene solapas", () => {
    renderWithProviders(<SectionHeader section={sectionAt("/")} />);
    expect(screen.getByRole("heading", { level: 4, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
