import { describe, it, expect } from "vitest";
import type { OcrObservation } from "./recognizeImage.js";
import { toLines } from "./toLines.js";

const obs = (text: string, x: number, y: number, height = 0.03): OcrObservation => ({ text, x, y, height });

describe("toLines", () => {
  it("une el label y el monto de la misma fila en orden de x", () => {
    expect(toLines([obs("$ 1.000,00", 0.78, 0.381), obs("Capital", 0.04, 0.379)])).toBe("Capital $ 1.000,00");
  });

  it("ordena las filas de arriba hacia abajo aunque Vision las devuelva mezcladas", () => {
    const observations = [
      obs("$ 2,00", 0.8, 0.5),
      obs("Capital", 0.04, 0.38),
      obs("Intereses", 0.04, 0.49),
      obs("$ 1,00", 0.8, 0.385),
    ];
    expect(toLines(observations)).toBe("Capital $ 1,00\nIntereses $ 2,00");
  });

  it("separa en filas distintas lo que está a más de media altura", () => {
    expect(toLines([obs("Arriba", 0.04, 0.3), obs("Abajo", 0.04, 0.32)])).toBe("Arriba\nAbajo");
  });

  it("sin observaciones devuelve un texto vacío", () => {
    expect(toLines([])).toBe("");
  });
});
