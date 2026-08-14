import { describe, it, expect, vi } from "vitest";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/macroSources.js", () => ({
  MACRO_START: "2025-01-01",
  fetchOficialSeries: vi.fn(),
  fetchUvaSeries: vi.fn(),
  fetchTasa30Series: vi.fn(),
}));
vi.mock("./backfillInflation.js", () => ({ backfillInflation: vi.fn() }));

import { fetchOficialSeries, fetchUvaSeries, fetchTasa30Series } from "../fx/macroSources.js";
import { backfillInflation } from "./backfillInflation.js";
import { backfillMacro } from "./backfillMacro.js";
import { MacroSeriesModel } from "../db/models.js";

withDb();

const mockedUsd = vi.mocked(fetchOficialSeries);
const mockedUva = vi.mocked(fetchUvaSeries);
const mockedTasa = vi.mocked(fetchTasa30Series);
const mockedInflacion = vi.mocked(backfillInflation);

describe("backfillMacro", () => {
  it("persiste las tres series con su discriminador", async () => {
    mockedUsd.mockResolvedValue([{ fecha: "2025-01-02", valor: 1010 }, { fecha: "2025-01-03", valor: 1015 }]);
    mockedUva.mockResolvedValue([{ fecha: "2025-01-02", valor: 1250.3 }]);
    mockedTasa.mockResolvedValue([{ fecha: "2025-01-02", valor: 29.1 }]);
    mockedInflacion.mockResolvedValue({ upserted: 7 });

    const r = await backfillMacro();
    expect(r).toEqual({ usd_oficial: 2, uva: 1, tasa30: 1, inflacion: 7 });

    const docs = await MacroSeriesModel.find().sort({ serie: 1, fecha: 1 }).lean();
    expect(docs).toHaveLength(4);
    expect(docs.map((d) => `${d.serie}:${d.fecha}`)).toEqual([
      "tasa30:2025-01-02", "usd_oficial:2025-01-02", "usd_oficial:2025-01-03", "uva:2025-01-02",
    ]);
  });

  it("es idempotente y actualiza el valor por (serie, fecha)", async () => {
    mockedUsd.mockResolvedValue([{ fecha: "2025-01-02", valor: 1010 }]);
    mockedUva.mockResolvedValue([]);
    mockedTasa.mockResolvedValue([]);
    mockedInflacion.mockResolvedValue({ upserted: 0 });
    await backfillMacro();

    mockedUsd.mockResolvedValue([{ fecha: "2025-01-02", valor: 1099 }]);
    await backfillMacro();

    const docs = await MacroSeriesModel.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].valor).toBe(1099);
  });

  it("no rompe si una serie viene vacía", async () => {
    mockedUsd.mockResolvedValue([]);
    mockedUva.mockResolvedValue([]);
    mockedTasa.mockResolvedValue([]);
    mockedInflacion.mockResolvedValue({ upserted: 0 });
    expect(await backfillMacro()).toEqual({ usd_oficial: 0, uva: 0, tasa30: 0, inflacion: 0 });
  });
});
