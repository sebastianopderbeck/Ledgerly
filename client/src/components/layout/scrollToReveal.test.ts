import { describe, it, expect } from "vitest";
import { scrollToReveal } from "./scrollToReveal.js";

const strip = { scrollLeft: 0, width: 200 };

describe("scrollToReveal", () => {
  it("si la solapa ya se ve, deja el scroll como está", () => {
    expect(scrollToReveal(strip, { left: 40, width: 120 })).toBe(0);
    expect(scrollToReveal({ scrollLeft: 100, width: 200 }, { left: 150, width: 100 })).toBe(100);
  });

  it("si la solapa queda cortada a la derecha, desliza hasta mostrar su borde derecho", () => {
    expect(scrollToReveal(strip, { left: 360, width: 120 })).toBe(280);
  });

  it("si la solapa queda cortada a la izquierda, desliza hasta su borde izquierdo", () => {
    expect(scrollToReveal({ scrollLeft: 300, width: 200 }, { left: 120, width: 120 })).toBe(120);
  });

  it("si la solapa es más ancha que la fila, muestra su comienzo", () => {
    expect(scrollToReveal(strip, { left: 360, width: 260 })).toBe(360);
  });
});
