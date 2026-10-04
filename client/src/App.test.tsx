import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "./App.js";

const NEW_SECTIONS = [
  { path: "/flujo", title: "Flujo de caja" },
  { path: "/suscripciones", title: "Suscripciones" },
  { path: "/patrimonio", title: "Patrimonio" },
  { path: "/presupuestos", title: "Presupuestos" },
  { path: "/vencimientos", title: "Vencimientos" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
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
