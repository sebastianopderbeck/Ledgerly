import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { thinTicks, truncateLabel, useChartLayout } from "./useChartLayout.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const months = (count: number) => Array.from({ length: count }, (_unused, index) => `m${index + 1}`);

const margin = { top: 16, right: 24, bottom: 64, left: 64 };

describe("thinTicks", () => {
  it("con menos valores que el máximo devuelve todos", () => {
    expect(thinTicks(months(3), 6)).toEqual(["m1", "m2", "m3"]);
  });

  it("con tantos valores como el máximo devuelve todos", () => {
    expect(thinTicks(months(6), 6)).toEqual(months(6));
  });

  it("con muchos valores toma equiespaciados, nunca más que el máximo, y termina en el último", () => {
    expect(thinTicks(months(12), 6)).toEqual(["m2", "m4", "m6", "m8", "m10", "m12"]);
    expect(thinTicks(months(14), 6)).toEqual(["m2", "m5", "m8", "m11", "m14"]);
  });

  it("con muchísimos valores sigue respetando el máximo e incluye el último", () => {
    const ticks = thinTicks(months(240), 6);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.at(-1)).toBe("m240");
  });

  it("con un máximo de 1 deja solo el último", () => {
    expect(thinTicks(months(5), 1)).toEqual(["m5"]);
  });
});

describe("truncateLabel", () => {
  it("deja igual una etiqueta que entra", () => {
    expect(truncateLabel("MERCADOLIBRE", 16)).toBe("MERCADOLIBRE");
    expect(truncateLabel("ABCDEFGHIJK", 11)).toBe("ABCDEFGHIJK");
  });

  it("corta una etiqueta larga y agrega puntos suspensivos sin pasarse del máximo", () => {
    expect(truncateLabel("MERCADOLIBRE SUPERMERCADO", 11)).toBe("MERCADOLIB…");
    expect(truncateLabel("MERCADOLIBRE SUPERMERCADO", 16)).toBe("MERCADOLIBRE SU…");
  });
});

describe("useChartLayout", () => {
  it("sin matchMedia se comporta como compu", () => {
    const { result } = renderHook(() => useChartLayout());
    expect(result.current.isMobile).toBe(false);
  });

  it("en compu deja el margen tal cual y no fija ticks", () => {
    emulateDesktop();
    const { result } = renderHook(() => useChartLayout());
    expect(result.current.isMobile).toBe(false);
    expect(result.current.seriesMargin(margin)).toEqual(margin);
    expect(result.current.bottomTicks(months(24))).toBeUndefined();
  });

  it("en mobile angosta el margen izquierdo y ralea los ticks a 6", () => {
    emulateMobile();
    const { result } = renderHook(() => useChartLayout());
    expect(result.current.isMobile).toBe(true);
    expect(result.current.seriesMargin(margin)).toEqual({ top: 16, right: 24, bottom: 64, left: 56 });
    expect(result.current.bottomTicks(months(24))).toEqual(["m4", "m8", "m12", "m16", "m20", "m24"]);
  });
});
