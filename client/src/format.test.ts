import { describe, it, expect } from "vitest";
import { formatUva } from "./format.js";

describe("formatUva", () => {
  it("usa separadores es-AR y sufijo UVA", () => {
    expect(formatUva(76960.84)).toBe("76.960,84 UVA");
    expect(formatUva(699.6)).toBe("699,60 UVA");
  });
});
