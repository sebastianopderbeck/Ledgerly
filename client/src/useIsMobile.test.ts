import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useIsMobile } from "./useIsMobile.js";
import { emulateDesktop, emulateMobile } from "./testing/viewport.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useIsMobile", () => {
  it("sin matchMedia asume compu", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("en un celular devuelve true", () => {
    emulateMobile();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("en una compu devuelve false", () => {
    emulateDesktop();
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("se actualiza si la pantalla cruza los 900px con el componente montado", () => {
    emulateMobile();
    const { result } = renderHook(() => useIsMobile());
    emulateDesktop();
    expect(result.current).toBe(false);
  });
});
