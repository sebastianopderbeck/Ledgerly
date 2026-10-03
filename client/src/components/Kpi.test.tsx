import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { Kpi } from "./Kpi.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const format = (value: number) => `$ ${value}`;

const renderKpi = () =>
  renderWithProviders(<Kpi label="Total pagado" value={1500} format={format} sub="en 13 cuotas" icon={<span />} color="primary" />);

describe("Kpi", () => {
  it("en compu muestra el valor como h5", () => {
    emulateDesktop();
    renderKpi();
    expect(screen.getByRole("heading", { level: 5 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 6 })).not.toBeInTheDocument();
  });

  it("en mobile muestra el valor como h6", () => {
    emulateMobile();
    renderKpi();
    expect(screen.getByRole("heading", { level: 6 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 5 })).not.toBeInTheDocument();
  });

  it("muestra la etiqueta y el subtítulo", () => {
    renderKpi();
    expect(screen.getByText("Total pagado")).toBeInTheDocument();
    expect(screen.getByText("en 13 cuotas")).toBeInTheDocument();
  });
});
