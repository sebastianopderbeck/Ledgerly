import { describe, it, expect } from "vitest";
import { formatLocalDate, formatMoney, formatMoneyOrDash, formatPercentOrDash, formatSignedPercent, formatUva } from "./format.js";

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

describe("formatPercentOrDash", () => {
  it("formatea el porcentaje con un decimal", () => {
    expect(formatPercentOrDash(15)).toBe("15,0%");
  });

  it("devuelve un guion si no hay valor", () => {
    expect(formatPercentOrDash(null)).toBe("—");
  });
});

describe("formatSignedPercent", () => {
  it("antepone + a los positivos", () => {
    expect(formatSignedPercent(4.72)).toBe("+4,7%");
  });

  it("usa el signo menos tipográfico en los negativos", () => {
    expect(formatSignedPercent(-0.99)).toBe("−1,0%");
  });
});
