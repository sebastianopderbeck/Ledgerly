import { describe, it, expect } from "vitest";
import {
  MAIL_CRON_HOURS, MAIL_TIME_ZONE, dayOfMonthIn, describeMailAutomation, describeMailSchedule, isScheduledDay,
  mailScheduleFor, parseMailSchedule,
} from "./mailSchedule.js";

const WINDOW = { fromDay: 25, toDay: 5 };

describe("parseMailSchedule", () => {
  it("sin MAIL_SYNC_DAYS la búsqueda automática está apagada", () => {
    expect(parseMailSchedule({})).toEqual({ days: null, invalid: [] });
  });

  it("lee el rango de días", () => {
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: " 1 - 10 " })).toEqual({ days: { fromDay: 1, toDay: 10 }, invalid: [] });
  });

  it.each(["x", "0-5", "25-32", "25"])("rechaza %s", (raw) => {
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: raw })).toEqual({
      days: null, invalid: ["MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5)"],
    });
  });
});

describe("mailScheduleFor", () => {
  it("usa la hora del cron de cada fuente", () => {
    expect(mailScheduleFor("icloud", { MAIL_SYNC_DAYS: "25-5" })).toEqual({ fromDay: 25, toDay: 5, hour: 21 });
    expect(mailScheduleFor("gmail", { MAIL_SYNC_DAYS: "25-5" })).toEqual({ fromDay: 25, toDay: 5, hour: 22 });
    expect(mailScheduleFor("gmail", {})).toBeNull();
  });

  it("las horas son las del spec", () => {
    expect(MAIL_CRON_HOURS).toEqual({ icloud: 21, gmail: 22 });
  });
});

describe("isScheduledDay", () => {
  it.each([[24, false], [25, true], [31, true], [1, true], [5, true], [6, false]])("del 25 al 5, el %i → %s", (day, expected) => {
    expect(isScheduledDay(WINDOW, day)).toBe(expected);
  });

  it("un rango dentro del mes", () => {
    expect(isScheduledDay({ fromDay: 1, toDay: 10 }, 10)).toBe(true);
    expect(isScheduledDay({ fromDay: 1, toDay: 10 }, 11)).toBe(false);
  });
});

describe("dayOfMonthIn", () => {
  it("devuelve el día en Buenos Aires aunque en UTC ya sea el siguiente", () => {
    expect(dayOfMonthIn(MAIL_TIME_ZONE, new Date("2026-10-26T00:30:00Z"))).toBe(25);
    expect(dayOfMonthIn(MAIL_TIME_ZONE, new Date("2026-10-25T00:30:00Z"))).toBe(24);
    expect(dayOfMonthIn(MAIL_TIME_ZONE, new Date("2026-10-25T15:00:00Z"))).toBe(25);
  });
});

describe("describeMailSchedule y describeMailAutomation", () => {
  it("describe la agenda de una fuente", () => {
    expect(describeMailSchedule({ fromDay: 25, toDay: 5, hour: 21 })).toBe("todos los días a las 21 h, del 25 al 5");
  });

  it("resume la búsqueda automática", () => {
    expect(describeMailAutomation(parseMailSchedule({ MAIL_SYNC_DAYS: "25-5" })))
      .toBe("Mails: búsqueda automática del 25 al 5 (iCloud 21 h, Gmail 22 h)");
    expect(describeMailAutomation(parseMailSchedule({}))).toBe("Mails: búsqueda automática apagada (falta MAIL_SYNC_DAYS)");
    expect(describeMailAutomation(parseMailSchedule({ MAIL_SYNC_DAYS: "x" })))
      .toBe("Mails: MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5), búsqueda automática apagada");
  });
});
