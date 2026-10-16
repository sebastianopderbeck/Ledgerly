import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "./App.js";

const NEW_SECTIONS = [
  { path: "/flujo", title: "Flujo de caja" },
  { path: "/suscripciones", title: "Suscripciones" },
  { path: "/servicios", title: "Servicios" },
  { path: "/patrimonio", title: "Patrimonio" },
  { path: "/presupuestos", title: "Presupuestos" },
  { path: "/vencimientos", title: "Vencimientos" },
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
  it.each(NEW_SECTIONS)("$path muestra la página «$title»", async ({ path, title }) => {
    window.history.pushState({}, "", path);
    render(<App />);
    expect(await screen.findByRole("heading", { level: 4, name: title })).toBeInTheDocument();
  });
});
