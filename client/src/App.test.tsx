import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { App } from "./App.js";

const NEW_SECTIONS = [
  { path: "/flujo", section: "Ingresos", tab: "Flujo" },
  { path: "/suscripciones", section: "Gastos", tab: "Suscripciones" },
  { path: "/servicios", section: "Gastos", tab: "Servicios" },
  { path: "/patrimonio", section: "Patrimonio", tab: "Patrimonio" },
  { path: "/vencimientos", section: "Gastos", tab: "Vencimientos" },
];

const OWNER_ME = { email: "owner@test.dev", name: "Owner", isOwner: true };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((url: string) => (url.endsWith("/auth/me")
    ? Promise.resolve(new Response(JSON.stringify(OWNER_ME), { status: 200, headers: { "Content-Type": "application/json" } }))
    : new Promise<Response>(() => undefined))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("rutas de las secciones nuevas", () => {
  it.each(NEW_SECTIONS)("$path abre $section con la solapa «$tab» marcada", async ({ path, section, tab }) => {
    window.history.pushState({}, "", path);
    render(<App />);
    expect(await screen.findByRole("heading", { level: 4, name: section })).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: `secciones de ${section}` });
    expect(within(tabs).getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
  });

  it("/presupuestos, fuera del menú, muestra su propio título", async () => {
    window.history.pushState({}, "", "/presupuestos");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 4, name: "Presupuestos" })).toBeInTheDocument();
  });
});
