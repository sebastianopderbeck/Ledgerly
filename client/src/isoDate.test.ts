import { describe, it, expect, afterEach, vi } from "vitest";
import {
  addDays,
  addMonths,
  daysBetween,
  formatDayMonth,
  formatDayOfMonthLong,
  formatMonthYear,
  formatWeekdayShort,
  lastDayOfMonth,
  monthOf,
  startOfWeek,
  todayIso,
  weekdayOf,
} from "./isoDate.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("aritmética de meses", () => {
  it("monthOf toma el mes de una fecha", () => {
    expect(monthOf("2026-10-13")).toBe("2026-10");
  });

  it("addMonths cruza el año hacia adelante y hacia atrás", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(addMonths("2026-08", -12)).toBe("2025-08");
    expect(addMonths("2026-05", 0)).toBe("2026-05");
  });

  it("lastDayOfMonth contempla febrero bisiesto y no bisiesto", () => {
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
  });
});

describe("aritmética de días", () => {
  it("addDays cruza el mes y el año", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("daysBetween es con signo", () => {
    expect(daysBetween("2026-10-01", "2026-10-13")).toBe(12);
    expect(daysBetween("2026-10-13", "2026-10-01")).toBe(-12);
    expect(daysBetween("2026-08-01", "2026-07-31")).toBe(-1);
  });
});

describe("semanas", () => {
  it("weekdayOf va de domingo (0) a sábado (6)", () => {
    expect(weekdayOf("2026-10-03")).toBe(6);
    expect(weekdayOf("2026-10-04")).toBe(0);
    expect(weekdayOf("2026-10-05")).toBe(1);
  });

  it("startOfWeek devuelve el lunes de la semana", () => {
    expect(startOfWeek("2026-10-07")).toBe("2026-10-05");
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28");
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05");
  });
});

describe("formatos", () => {
  it("formatDayMonth da día/mes con dos dígitos", () => {
    expect(formatDayMonth("2026-10-13")).toBe("13/10");
    expect(formatDayMonth("2026-01-05")).toBe("05/01");
  });

  it("formatWeekdayShort da el día corto en español", () => {
    expect(formatWeekdayShort("2026-10-07")).toBe("mié");
    expect(formatWeekdayShort("2026-10-03")).toBe("sáb");
  });

  it("formatDayOfMonthLong da el día y el mes en palabras", () => {
    expect(formatDayOfMonthLong("2026-10-12")).toBe("12 de octubre");
    expect(formatDayOfMonthLong("2026-12-31")).toBe("31 de diciembre");
  });

  it("formatMonthYear da el mes en minúscula y el año", () => {
    expect(formatMonthYear("2026-11")).toBe("noviembre 2026");
  });
});

describe("todayIso", () => {
  it("devuelve la fecha local", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 3, 23, 30));
    expect(todayIso()).toBe("2026-10-03");
  });
});
