import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useColorModeState } from "./theme.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useColorModeState", () => {
  it("arranca en modo oscuro la primera vez", () => {
    const { result } = renderHook(() => useColorModeState());
    expect(result.current.mode).toBe("dark");
    expect(result.current.theme.palette.mode).toBe("dark");
  });

  it("recuerda el modo elegido al volver a abrir la app", () => {
    const first = renderHook(() => useColorModeState());
    act(() => first.result.current.toggle());
    first.unmount();

    const { result } = renderHook(() => useColorModeState());

    expect(result.current.mode).toBe("light");
    expect(result.current.theme.palette.mode).toBe("light");
  });

  it("ignora un modo guardado inválido y vuelve a oscuro", () => {
    localStorage.setItem("ledgerly.colorMode", JSON.stringify("sepia"));
    const { result } = renderHook(() => useColorModeState());
    expect(result.current.mode).toBe("dark");
  });
});
