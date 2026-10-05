import { describe, it, expect } from "vitest";
import { MIN_SYNC_INTERVAL_MINUTES, parseSyncInterval } from "./syncInterval.js";

describe("parseSyncInterval", () => {
  it.each([
    [undefined, null],
    ["", null],
    ["360", 360],
    [" 90 ", 90],
    ["abc", null],
    ["5", null],
    ["0", null],
    ["15", 15],
    ["90.5", null],
    ["-30", null],
  ])("%j → %j", (raw, expected) => {
    expect(parseSyncInterval(raw)).toBe(expected);
  });

  it("el mínimo es de 15 minutos", () => {
    expect(MIN_SYNC_INTERVAL_MINUTES).toBe(15);
  });
});
