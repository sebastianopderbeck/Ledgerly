import { describe, it, expect, vi } from "vitest";

vi.mock("./backfillMacro.js", () => ({ backfillMacro: vi.fn() }));
vi.mock("./refreshRates.js", () => ({ refreshAllRates: vi.fn() }));

import { backfillMacro } from "./backfillMacro.js";
import { refreshAllRates } from "./refreshRates.js";
import { refreshMacroData } from "./refreshMacroData.js";

const mockedMacro = vi.mocked(backfillMacro);
const mockedRates = vi.mocked(refreshAllRates);

describe("refreshMacroData", () => {
  it("combina las series macro con el refresco de tipos de cambio", async () => {
    mockedMacro.mockResolvedValue({ usd_oficial: 232, uva: 232, tasa30: 221, inflacion: 19 });
    mockedRates.mockResolvedValue({
      cupones: { updated: 12, skipped: 1 },
      auto: { updated: 8, skipped: 0 },
      sueldos: { updated: 6, skipped: 0 },
    });

    expect(await refreshMacroData()).toEqual({
      series: { usdOficial: 232, uva: 232, tasa30: 221, inflacion: 19 },
      tipoCambio: {
        cupones: { updated: 12, skipped: 1 },
        auto: { updated: 8, skipped: 0 },
        sueldos: { updated: 6, skipped: 0 },
      },
    });
  });

  it("trae las series antes de refrescar los tipos de cambio", async () => {
    const order: string[] = [];
    mockedMacro.mockImplementation(async () => {
      order.push("series");
      return { usd_oficial: 0, uva: 0, tasa30: 0, inflacion: 0 };
    });
    mockedRates.mockImplementation(async () => {
      order.push("tipoCambio");
      return { cupones: { updated: 0, skipped: 0 }, auto: { updated: 0, skipped: 0 }, sueldos: { updated: 0, skipped: 0 } };
    });

    await refreshMacroData();

    expect(order).toEqual(["series", "tipoCambio"]);
  });
});
