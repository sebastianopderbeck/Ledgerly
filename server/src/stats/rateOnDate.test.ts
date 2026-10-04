import { describe, it, expect } from "vitest";
import { pointOnDate, rateOnDate, type RatePoint } from "./rateOnDate.js";

const points: RatePoint[] = [
  { fecha: "2026-09-10", valor: 1380 },
  { fecha: "2026-09-11", valor: 1390 },
  { fecha: "2026-09-14", valor: 1400 },
];

describe("rateOnDate", () => {
  it("devuelve la cotización de la fecha exacta", () => {
    expect(rateOnDate("2026-09-11", points)).toBe(1390);
  });

  it("en un fin de semana toma el día hábil anterior", () => {
    expect(rateOnDate("2026-09-13", points)).toBe(1390);
  });

  it("después del último punto usa el último", () => {
    expect(rateOnDate("2026-10-03", points)).toBe(1400);
  });

  it("devuelve null antes de la serie o con la serie vacía", () => {
    expect(rateOnDate("2026-09-09", points)).toBeNull();
    expect(rateOnDate("2026-09-11", [])).toBeNull();
  });
});

describe("pointOnDate", () => {
  it("devuelve el punto con su fecha para informar de cuándo es el valor", () => {
    expect(pointOnDate("2026-09-13", points)).toEqual({ fecha: "2026-09-11", valor: 1390 });
    expect(pointOnDate("2026-09-01", points)).toBeNull();
  });
});
