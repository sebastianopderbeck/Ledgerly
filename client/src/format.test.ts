import { describe, it, expect } from "vitest";
import { formatLocalDate, formatMoney, formatMoneyOrDash, formatUva } from "./format.js";

describe("formatUva", () => {
  it("usa separadores es-AR y sufijo UVA", () => {
    expect(formatUva(76960.84)).toBe("76.960,84 UVA");
    expect(formatUva(699.6)).toBe("699,60 UVA");
  });
});

describe("formatLocalDate", () => {
  it("devuelve la fecha local en formato año-mes-día", () => {
    expect(formatLocalDate("2026-07-05T12:00:00.000Z")).toBe("2026-07-05");
  });
});

describe("formatMoneyOrDash", () => {
  it("formatea el monto como formatMoney", () => {
    expect(formatMoneyOrDash(813.1, "USD")).toBe(formatMoney(813.1, "USD"));
  });

  it("sin monto muestra un guion", () => {
    expect(formatMoneyOrDash(null, "ARS")).toBe("—");
  });
});
