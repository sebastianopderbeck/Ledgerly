import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "./testing/renderWithProviders.js";
import { Layout } from "./components/Layout.js";

afterEach(cleanup);

describe("Layout", () => {
  it("renderiza la navegación principal", () => {
    renderWithProviders(<Layout><div>contenido</div></Layout>);
    for (const name of [/dashboard/i, /importar/i, /movimientos/i, /créditos/i, /reglas/i]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("ofrece el botón para actualizar las variables macro", () => {
    renderWithProviders(<Layout><div>contenido</div></Layout>);
    expect(screen.getByLabelText("actualizar datos")).toBeInTheDocument();
  });
});
