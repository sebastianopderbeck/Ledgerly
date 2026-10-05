import { describe, it, expect } from "vitest";
import { formatMoneyInput, parseMoneyInput } from "./moneyInput.js";

describe("parseMoneyInput", () => {
  it("lee montos escritos a la argentina", () => {
    expect(parseMoneyInput("1.234.567,89")).toBe(1234567.89);
    expect(parseMoneyInput("1.500,50")).toBe(1500.5);
    expect(parseMoneyInput("1500,5")).toBe(1500.5);
  });

  it("sin coma, los puntos agrupados de a tres son de miles", () => {
    expect(parseMoneyInput("300.000")).toBe(300000);
    expect(parseMoneyInput("1.500.000")).toBe(1500000);
    expect(parseMoneyInput("1.500")).toBe(1500);
  });

  it("sin coma ni grupos de miles, el punto es decimal", () => {
    expect(parseMoneyInput("1500.75")).toBe(1500.75);
    expect(parseMoneyInput("300000")).toBe(300000);
  });

  it("ignora $, US$ y espacios, también los no separables", () => {
    expect(parseMoneyInput("$ 25.000")).toBe(25000);
    expect(parseMoneyInput("US$ 10.000")).toBe(10000);
    expect(parseMoneyInput("$ 1.500.000,50")).toBe(1500000.5);
  });

  it("acepta cero", () => {
    expect(parseMoneyInput("0")).toBe(0);
  });

  it("devuelve null si no queda un número no negativo", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("   ")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("-5")).toBeNull();
    expect(parseMoneyInput("0x10")).toBeNull();
    expect(parseMoneyInput("1,2,3")).toBeNull();
  });
});

describe("formatMoneyInput", () => {
  it("escribe el monto como se tipea, sin símbolo", () => {
    expect(formatMoneyInput(300000)).toBe("300.000");
    expect(formatMoneyInput(1500.5)).toBe("1.500,5");
  });

  it("ida y vuelta con parseMoneyInput", () => {
    for (const value of [0, 25000, 1500.5, 1234567.89]) {
      expect(parseMoneyInput(formatMoneyInput(value))).toBe(value);
    }
  });
});
