import { describe, it, expect } from "vitest";
import type { MacroRefreshDTO } from "@ledgerly/shared";
import { refreshSummaryMessage } from "./macroRefreshSummary.js";

const dto = (overrides: Partial<MacroRefreshDTO> = {}): MacroRefreshDTO => ({
  series: { usdOficial: 232, uva: 232, tasa30: 221, inflacion: 19 },
  tipoCambio: {
    cupones: { updated: 12, skipped: 0 },
    auto: { updated: 8, skipped: 0 },
    sueldos: { updated: 6, skipped: 0 },
  },
  ...overrides,
});

describe("refreshSummaryMessage", () => {
  it("resume los puntos de serie y los tipos de cambio actualizados", () => {
    expect(refreshSummaryMessage(dto())).toBe("Datos actualizados · 704 puntos de series · 26 tipos de cambio");
  });

  it("avisa qué series volvieron vacías", () => {
    const message = refreshSummaryMessage(dto({ series: { usdOficial: 232, uva: 0, tasa30: 0, inflacion: 19 } }));
    expect(message).toBe("Datos actualizados · 251 puntos de series · 26 tipos de cambio · sin datos: UVA, tasa");
  });

  it("avisa cuántos documentos quedaron sin cotización", () => {
    const message = refreshSummaryMessage(dto({
      tipoCambio: {
        cupones: { updated: 12, skipped: 1 },
        auto: { updated: 8, skipped: 0 },
        sueldos: { updated: 6, skipped: 2 },
      },
    }));
    expect(message).toBe("Datos actualizados · 704 puntos de series · 26 tipos de cambio · 3 sin cotización");
  });

  it("no pluraliza de más cuando hay un solo punto o documento", () => {
    const message = refreshSummaryMessage(dto({
      series: { usdOficial: 1, uva: 0, tasa30: 0, inflacion: 0 },
      tipoCambio: {
        cupones: { updated: 1, skipped: 0 },
        auto: { updated: 0, skipped: 0 },
        sueldos: { updated: 0, skipped: 0 },
      },
    }));
    expect(message).toBe("Datos actualizados · 1 punto de series · 1 tipo de cambio · sin datos: UVA, tasa, inflación");
  });
});
