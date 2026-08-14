import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { MacroSignalCards } from "./MacroSignalCards.js";
import type { MacroSignal } from "../macroSignals.js";

afterEach(cleanup);

const signals: MacroSignal[] = [
  { id: "dolar", label: "Dólar vs su promedio desde 2025", value: 87, format: "indice", status: "good", reading: "El dólar está 13,0% por debajo de su promedio desde Enero 2025." },
  { id: "pesos", label: "Tasa real en pesos", value: -3.2, format: "porcentaje", status: "bad", reading: "Un plazo fijo a TNA 20,0% deja −3,2% real anual." },
];

describe("MacroSignalCards", () => {
  it("muestra una tarjeta por señal con su lectura", () => {
    renderWithProviders(<MacroSignalCards signals={signals} />);
    expect(screen.getByText("Dólar vs su promedio desde 2025")).toBeInTheDocument();
    expect(screen.getByText("Tasa real en pesos")).toBeInTheDocument();
    expect(screen.getByText(/13,0% por debajo/)).toBeInTheDocument();
  });

  it("no renderiza nada sin señales", () => {
    const { container } = renderWithProviders(<MacroSignalCards signals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
