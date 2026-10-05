import { describe, it, expect } from "vitest";
import {
  addDays,
  addMonths,
  addMonthsClamped,
  daysBetween,
  daysInMonth,
  lastDayOfMonth,
  monthOf,
  monthRange,
  monthsBetween,
} from "./months.js";

describe("monthOf", () => {
  it("toma el mes de una fecha o de un mes", () => {
    expect(monthOf("2026-09-14")).toBe("2026-09");
    expect(monthOf("2026-09")).toBe("2026-09");
  });
});

describe("addMonths", () => {
  it("suma y resta meses cruzando el año", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-08", -12)).toBe("2025-08");
    expect(addMonths("2026-05", 0)).toBe("2026-05");
  });

  it("acepta una fecha completa y devuelve el mes", () => {
    expect(addMonths("2026-12-31", 1)).toBe("2027-01");
  });
});

describe("monthsBetween", () => {
  it("cuenta meses hacia adelante, cero y hacia atrás", () => {
    expect(monthsBetween("2026-10", "2027-01")).toBe(3);
    expect(monthsBetween("2026-10", "2026-10")).toBe(0);
    expect(monthsBetween("2026-10", "2026-07")).toBe(-3);
  });
});

describe("monthRange", () => {
  it("es inclusiva en las dos puntas y cruza el año", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthRange("2026-03", "2026-03")).toEqual(["2026-03"]);
  });

  it("devuelve una lista vacía si from es posterior a to", () => {
    expect(monthRange("2026-04", "2026-03")).toEqual([]);
  });
});

describe("addDays y daysBetween", () => {
  it("suman días cruzando el mes y el año", () => {
    expect(addDays("2026-09-25", 12)).toBe("2026-10-07");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("daysBetween es con signo", () => {
    expect(daysBetween("2026-09-25", "2026-10-07")).toBe(12);
    expect(daysBetween("2026-10-07", "2026-09-25")).toBe(-12);
    expect(daysBetween("2026-10-07", "2026-10-07")).toBe(0);
  });
});

describe("daysInMonth y lastDayOfMonth", () => {
  it("contemplan los años bisiestos", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(lastDayOfMonth("2026-09")).toBe("2026-09-30");
    expect(lastDayOfMonth("2026-12-05")).toBe("2026-12-31");
  });
});

describe("addMonthsClamped", () => {
  it("recorta el día al último del mes destino", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("conserva el día cuando entra y cruza el año", () => {
    expect(addMonthsClamped("2026-08-09", 1)).toBe("2026-09-09");
    expect(addMonthsClamped("2026-11-15", 2)).toBe("2027-01-15");
    expect(addMonthsClamped("2026-10-03", -12)).toBe("2025-10-03");
  });
});
