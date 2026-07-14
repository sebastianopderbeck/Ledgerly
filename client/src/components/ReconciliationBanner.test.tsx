import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReconciliationBanner } from "./ReconciliationBanner.js";

describe("ReconciliationBanner", () => {
  it("no muestra nada si reconcilia ok", () => {
    const { container } = render(<ReconciliationBanner reconciliation={{ ok: true, entries: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("muestra advertencia con el detalle si no cuadra", () => {
    render(<ReconciliationBanner reconciliation={{ ok: false, entries: [
      { currency: "ARS", expected: 100, parsed: 90, diff: -10, ok: false },
    ] }} />);
    expect(screen.getByText(/no cuadra/i)).toBeInTheDocument();
    expect(screen.getByText(/ARS/)).toBeInTheDocument();
  });
});
