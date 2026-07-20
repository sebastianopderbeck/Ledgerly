import { describe, it, expect } from "vitest";
import { representativeRateDate, consumptionMonth } from "./monthlyUsd.js";

describe("representativeRateDate", () => {
  it("usa el último día del mes para meses pasados", () => {
    expect(representativeRateDate("2026-05", "2026-07-20")).toBe("2026-05-31");
    expect(representativeRateDate("2026-02", "2026-07-20")).toBe("2026-02-28");
  });

  it("topea en hoy para el mes en curso", () => {
    expect(representativeRateDate("2026-07", "2026-07-20")).toBe("2026-07-20");
  });
});

describe("consumptionMonth", () => {
  it("atribuye un cierre temprano al mes anterior", () => {
    expect(consumptionMonth("2026-07-02")).toBe("2026-06");
    expect(consumptionMonth("2026-01-05")).toBe("2025-12");
  });

  it("atribuye un cierre tardío al mismo mes", () => {
    expect(consumptionMonth("2026-07-28")).toBe("2026-07");
  });
});
