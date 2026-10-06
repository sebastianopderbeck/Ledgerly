import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { MoreSheet } from "./MoreSheet.js";
import { MORE_GROUPS } from "./navItems.js";

afterEach(cleanup);

const noop = () => undefined;

const sheetNav = () => screen.getByRole("navigation", { name: "más secciones" });

describe("MoreSheet", () => {
  it("es un diálogo titulado Más secciones", () => {
    renderWithProviders(<MoreSheet open onClose={noop} />);
    expect(screen.getByRole("dialog", { name: "Más secciones" })).toBeInTheDocument();
  });

  it("lista Sueldo, Vencimientos, Flujo, Suscripciones, Auto, Créditos, Patrimonio, Contexto y Reglas", () => {
    renderWithProviders(<MoreSheet open onClose={noop} />);
    const names = within(sheetNav()).getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual([
      "Sueldo", "Vencimientos", "Flujo", "Suscripciones", "Auto", "Créditos", "Patrimonio", "Contexto", "Reglas",
    ]);
  });

  it("separa los grupos con una línea", () => {
    renderWithProviders(<MoreSheet open onClose={noop} />);
    expect(within(sheetNav()).getAllByRole("separator")).toHaveLength(MORE_GROUPS.length - 1);
  });

  it("los links conservan los filtros globales y descartan los de Movimientos", () => {
    renderWithProviders(<MoreSheet open onClose={noop} />, {
      route: "/transactions?year=2025&currency=USD&category=Compras&search=uber",
    });
    expect(within(sheetNav()).getByRole("link", { name: "Créditos" })).toHaveAttribute("href", "/credits?year=2025&currency=USD");
  });

  it("tocar una sección pide cerrar la hoja", () => {
    const onClose = vi.fn();
    renderWithProviders(<MoreSheet open onClose={onClose} />);
    fireEvent.click(within(sheetNav()).getByRole("link", { name: "Sueldo" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
