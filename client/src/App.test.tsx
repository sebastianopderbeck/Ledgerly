import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./testing/renderWithProviders.js";
import { Layout } from "./components/Layout.js";

describe("Layout", () => {
  it("renderiza la navegación principal", () => {
    renderWithProviders(<Layout><div>contenido</div></Layout>);
    for (const name of [/dashboard/i, /importar/i, /movimientos/i, /créditos/i, /reglas/i]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });
});
