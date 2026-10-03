import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { Layout } from "./Layout.js";
import { NAV_ITEMS } from "./navItems.js";

const SECTIONS = [/dashboard/i, /cuotas/i, /créditos/i, /auto/i, /sueldo/i, /contexto/i, /movimientos/i, /reglas/i, /importar/i];

const emulateViewport = (matches: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));

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

  it("en desktop no ofrece la hamburguesa", () => {
    emulateViewport(true);
    renderLayout();
    expect(within(quickActions()).queryByLabelText("abrir menú")).not.toBeInTheDocument();
  });

  it("en pantallas chicas abre la navegación desde la hamburguesa y la cierra al navegar", async () => {
    emulateViewport(false);
    renderLayout();
    expect(screen.queryByRole("navigation", { name: /principal/i })).not.toBeInTheDocument();

    fireEvent.click(within(quickActions()).getByLabelText("abrir menú"));
    fireEvent.click(within(mainNavigation()).getByRole("link", { name: /sueldo/i }));

    await waitFor(() => expect(screen.queryByRole("navigation", { name: /principal/i })).not.toBeInTheDocument());
  });
});
