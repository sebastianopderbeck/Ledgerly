import { describe, it, expect } from "vitest";
import { UNCATEGORIZED, categoryOptions } from "./categoryOptions.js";

describe("UNCATEGORIZED", () => {
  it("coincide con la categoría que asignan las reglas sin match", () => {
    expect(UNCATEGORIZED).toBe("Sin categoría");
  });
});

describe("categoryOptions", () => {
  it("une las categorías de los movimientos y de las reglas, sin repetir", () => {
    expect(categoryOptions(["Comida", "Transporte"], [{ category: "Comida" }, { category: "Hogar" }]))
      .toEqual(["Comida", "Hogar", "Transporte"]);
  });

  it("descarta vacíos y «Sin categoría», y recorta espacios", () => {
    expect(categoryOptions(["  ", "Sin categoría", " Salud "], [{ category: "" }])).toEqual(["Salud"]);
  });

  it("ordena alfabéticamente en español", () => {
    expect(categoryOptions(["Útiles", "Electrónica", "Educación", "ahorro"], [])).toEqual(["ahorro", "Educación", "Electrónica", "Útiles"]);
  });
});
