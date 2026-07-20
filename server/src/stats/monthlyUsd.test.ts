import { describe, it, expect } from "vitest";
import { representativeRateDate } from "./monthlyUsd.js";

describe("representativeRateDate", () => {
  it("usa el último día del mes para meses pasados", () => {
    expect(representativeRateDate("2026-05", "2026-07-20")).toBe("2026-05-31");
    expect(representativeRateDate("2026-02", "2026-07-20")).toBe("2026-02-28");
  });

  it("topea en hoy para el mes en curso", () => {
    expect(representativeRateDate("2026-07", "2026-07-20")).toBe("2026-07-20");
  });
});
