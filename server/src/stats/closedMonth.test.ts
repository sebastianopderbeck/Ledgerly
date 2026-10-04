import { describe, it, expect } from "vitest";
import { lastClosedMonth } from "./closedMonth.js";

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe("lastClosedMonth", () => {
  it("un cierre a principio de mes cubre completo el mes anterior", () => {
    expect(lastClosedMonth([day("2026-10-02")])).toBe("2026-09");
  });

  it("un cierre el último día del mes cierra ese mismo mes", () => {
    expect(lastClosedMonth([day("2026-09-30")])).toBe("2026-09");
  });

  it("un cierre antes del último día deja abierto su mes", () => {
    expect(lastClosedMonth([day("2026-09-25")])).toBe("2026-08");
  });

  it("cruza el cambio de año", () => {
    expect(lastClosedMonth([day("2026-01-02")])).toBe("2025-12");
    expect(lastClosedMonth([day("2025-12-31")])).toBe("2025-12");
  });

  it("respeta febrero de 28 y de 29 días", () => {
    expect(lastClosedMonth([day("2026-02-28")])).toBe("2026-02");
    expect(lastClosedMonth([day("2028-02-28")])).toBe("2028-01");
    expect(lastClosedMonth([day("2028-02-29")])).toBe("2028-02");
  });

  it("con varias tarjetas manda el cierre más reciente e ignora los null", () => {
    expect(lastClosedMonth([day("2026-09-25"), null, day("2026-10-02"), day("2026-08-28")])).toBe("2026-09");
  });

  it("sin fechas devuelve null", () => {
    expect(lastClosedMonth([])).toBeNull();
    expect(lastClosedMonth([null, null])).toBeNull();
  });
});
