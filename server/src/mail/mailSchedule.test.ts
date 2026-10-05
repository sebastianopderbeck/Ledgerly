import { describe, it, expect } from "vitest";
import {
  DEFAULT_MAIL_SYNC_HOUR, describeMailAutomation, describeMailSchedule, isScheduledDay, MAIL_STARTUP_DELAY_MS, nextMailRunDelayMs,
  nextScheduledRun, parseMailSchedule, type MailSchedule,
} from "./mailSchedule.js";

const WINDOW: MailSchedule = { fromDay: 25, toDay: 5, hour: 21 };
const MINUTE_MS = 60_000;

describe("parseMailSchedule", () => {
  it("lee el rango con la hora por defecto", () => {
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: "25-5" })).toEqual({ schedule: WINDOW, invalid: [] });
    expect(DEFAULT_MAIL_SYNC_HOUR).toBe(21);
  });

  it("acepta espacios, rangos sin cruce de mes y una hora explícita", () => {
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: " 1 - 10 ", MAIL_SYNC_HOUR: "9" }))
      .toEqual({ schedule: { fromDay: 1, toDay: 10, hour: 9 }, invalid: [] });
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: "25-5", MAIL_SYNC_HOUR: "0" }).schedule?.hour).toBe(0);
  });

  it("sin MAIL_SYNC_DAYS no hay agenda ni avisos", () => {
    expect(parseMailSchedule({})).toEqual({ schedule: null, invalid: [] });
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: "  " })).toEqual({ schedule: null, invalid: [] });
    expect(parseMailSchedule({ MAIL_SYNC_HOUR: "x" })).toEqual({ schedule: null, invalid: [] });
  });

  it.each(["25", "0-5", "25-32", "a-b", "25-", "-5", "1-2-3"])("rechaza los días %s", (raw) => {
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: raw })).toEqual({
      schedule: null, invalid: ["MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5)"],
    });
  });

  it.each(["24", "-1", "x", "1.5", "21h"])("rechaza la hora %s", (raw) => {
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: "25-5", MAIL_SYNC_HOUR: raw })).toEqual({
      schedule: null, invalid: ["MAIL_SYNC_HOUR inválido (entero de 0 a 23)"],
    });
  });

  it("informa los dos errores juntos", () => {
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: "x", MAIL_SYNC_HOUR: "x" }).invalid).toEqual([
      "MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5)",
      "MAIL_SYNC_HOUR inválido (entero de 0 a 23)",
    ]);
  });
});

describe("isScheduledDay", () => {
  it.each([[24, false], [25, true], [31, true], [1, true], [5, true], [6, false]])("día %i con 25-5 → %s", (day, expected) => {
    expect(isScheduledDay(WINDOW, new Date(2026, 9, day, 12))).toBe(expected);
  });

  it("rango sin cruce de mes", () => {
    const window: MailSchedule = { fromDay: 1, toDay: 10, hour: 21 };
    expect(isScheduledDay(window, new Date(2026, 9, 10, 12))).toBe(true);
    expect(isScheduledDay(window, new Date(2026, 9, 11, 12))).toBe(false);
  });
});

describe("nextScheduledRun", () => {
  it("el mismo día antes de la hora corre hoy", () => {
    expect(nextScheduledRun(WINDOW, new Date(2026, 9, 27, 10))).toEqual(new Date(2026, 9, 27, 21));
  });

  it("el mismo día después de la hora pasa al próximo día de la ventana", () => {
    expect(nextScheduledRun(WINDOW, new Date(2026, 9, 27, 22))).toEqual(new Date(2026, 9, 28, 21));
  });

  it("justo a la hora es estrictamente posterior", () => {
    expect(nextScheduledRun(WINDOW, new Date(2026, 9, 27, 21))).toEqual(new Date(2026, 9, 28, 21));
  });

  it("después del 5 salta al 25 del mismo mes", () => {
    expect(nextScheduledRun(WINDOW, new Date(2026, 9, 5, 22))).toEqual(new Date(2026, 9, 25, 21));
  });

  it("cruza el fin de año", () => {
    expect(nextScheduledRun(WINDOW, new Date(2026, 11, 31, 22))).toEqual(new Date(2027, 0, 1, 21));
  });

  it("en febrero cubre del 25 al 28 y sigue en marzo", () => {
    expect(nextScheduledRun(WINDOW, new Date(2027, 1, 25, 22))).toEqual(new Date(2027, 1, 26, 21));
    expect(nextScheduledRun(WINDOW, new Date(2027, 1, 28, 22))).toEqual(new Date(2027, 2, 1, 21));
  });

  it("rango sin cruce de mes", () => {
    const window: MailSchedule = { fromDay: 1, toDay: 10, hour: 9 };
    expect(nextScheduledRun(window, new Date(2026, 9, 10, 10))).toEqual(new Date(2026, 10, 1, 9));
  });

  it("deja los minutos, segundos y milisegundos en cero", () => {
    const next = nextScheduledRun(WINDOW, new Date(2026, 9, 26, 3, 17, 42, 500));
    expect([next.getMinutes(), next.getSeconds(), next.getMilliseconds()]).toEqual([0, 0, 0]);
  });
});

describe("nextMailRunDelayMs", () => {
  const now = new Date(2026, 9, 27, 10);

  it("con la corrida de ayer espera hasta el slot de hoy", () => {
    const last = new Date(2026, 9, 26, 21);
    expect(nextMailRunDelayMs(WINDOW, last, now)).toBe(11 * 60 * MINUTE_MS);
  });

  it("si el slot ya pasó (la Mac dormía) corre con el delay de arranque", () => {
    expect(nextMailRunDelayMs(WINDOW, new Date(2026, 9, 3, 21), new Date(2026, 9, 27, 10))).toBe(MAIL_STARTUP_DELAY_MS);
    expect(nextMailRunDelayMs(WINDOW, new Date(2026, 9, 26, 21), new Date(2026, 9, 27, 22))).toBe(MAIL_STARTUP_DELAY_MS);
  });

  it("sin corridas previas usa la hora actual", () => {
    expect(nextMailRunDelayMs(WINDOW, null, now)).toBe(11 * 60 * MINUTE_MS);
    expect(nextMailRunDelayMs(WINDOW, null, new Date(2026, 9, 10, 10))).toBe(
      new Date(2026, 9, 25, 21).getTime() - new Date(2026, 9, 10, 10).getTime(),
    );
  });
});

describe("describeMailSchedule", () => {
  it("describe la hora y los días", () => {
    expect(describeMailSchedule(WINDOW)).toBe("todos los días a las 21 h, del 25 al 5");
    expect(describeMailSchedule({ fromDay: 1, toDay: 10, hour: 9 })).toBe("todos los días a las 9 h, del 1 al 10");
  });
});

describe("describeMailAutomation", () => {
  it("arma la línea de arranque para cada caso", () => {
    expect(describeMailAutomation(parseMailSchedule({ MAIL_SYNC_DAYS: "25-5" })))
      .toBe("Mails: búsqueda automática todos los días a las 21 h, del 25 al 5");
    expect(describeMailAutomation(parseMailSchedule({})))
      .toBe("Mails: búsqueda automática apagada (falta MAIL_SYNC_DAYS)");
    expect(describeMailAutomation(parseMailSchedule({ MAIL_SYNC_DAYS: "x", MAIL_SYNC_HOUR: "x" })))
      .toBe("Mails: MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5); MAIL_SYNC_HOUR inválido (entero de 0 a 23), búsqueda automática apagada");
  });
});
