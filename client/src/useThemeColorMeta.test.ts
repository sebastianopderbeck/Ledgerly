import { describe, it, expect, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useThemeColorMeta } from "./useThemeColorMeta.js";

const addThemeColorMeta = (): HTMLMetaElement => {
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = "#0b0f19";
  document.head.append(meta);
  return meta;
};

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
});

describe("useThemeColorMeta", () => {
  it("pone el color pedido en el meta theme-color", () => {
    const meta = addThemeColorMeta();
    renderHook(() => useThemeColorMeta("#f4f7fb"));
    expect(meta.content).toBe("#f4f7fb");
  });

  it("lo actualiza cuando cambia el modo", () => {
    const meta = addThemeColorMeta();
    const { rerender } = renderHook(({ color }) => useThemeColorMeta(color), { initialProps: { color: "#0b0f19" } });
    rerender({ color: "#f4f7fb" });
    expect(meta.content).toBe("#f4f7fb");
  });

  it("sin meta theme-color no falla", () => {
    expect(() => renderHook(() => useThemeColorMeta("#f4f7fb"))).not.toThrow();
  });
});
