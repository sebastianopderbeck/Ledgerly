import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSheetTarget } from "./useSheetTarget.js";

afterEach(cleanup);

describe("useSheetTarget", () => {
  it("arranca cerrada y sin registro", () => {
    const { result } = renderHook(() => useSheetTarget<string>());
    expect(result.current.open).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("show abre la hoja con el registro elegido", () => {
    const { result } = renderHook(() => useSheetTarget<string>());
    act(() => result.current.show("cuota 6"));
    expect(result.current.open).toBe(true);
    expect(result.current.target).toBe("cuota 6");
  });

  it("close cierra la hoja pero conserva el registro mientras se va", () => {
    const { result } = renderHook(() => useSheetTarget<string>());
    act(() => result.current.show("cuota 6"));
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(result.current.target).toBe("cuota 6");
  });
});
