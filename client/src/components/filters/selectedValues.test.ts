import { describe, it, expect } from "vitest";
import { selectedValues } from "./selectedValues.js";

describe("selectedValues", () => {
  it("devuelve los strings de un array", () => {
    expect(selectedValues(["2025", "2026"])).toEqual(["2025", "2026"]);
  });

  it("descarta lo que no es string dentro del array", () => {
    expect(selectedValues(["2025", 7, null])).toEqual(["2025"]);
  });

  it("separa por coma el string que deja el autocompletado del navegador", () => {
    expect(selectedValues("Compras,Salud")).toEqual(["Compras", "Salud"]);
  });

  it("sin valor devuelve una lista vacía", () => {
    expect(selectedValues("")).toEqual([]);
    expect(selectedValues(undefined)).toEqual([]);
  });
});
