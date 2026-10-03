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

describe("tema en pantallas chicas", () => {
  it("achica h4 y h5 por debajo de 900px sin cambiar el tamaño de compu", () => {
    const { result } = renderHook(() => useColorModeState());
    const { typography } = result.current.theme;
    expect(typography.h4).toMatchObject({ fontSize: "2.125rem", "@media (max-width:899.95px)": { fontSize: "1.625rem" } });
    expect(typography.h5).toMatchObject({ fontSize: "1.5rem", "@media (max-width:899.95px)": { fontSize: "1.25rem" } });
  });

  it("el efecto al pasar el mouse por una tarjeta solo aplica en dispositivos con hover", () => {
    const { result } = renderHook(() => useColorModeState());
    const root = result.current.theme.components?.MuiCard?.styleOverrides?.root;
    expect(root).toHaveProperty(["@media (hover: hover)", "&:hover", "transform"], "translateY(-3px)");
    expect(root).not.toHaveProperty(["&:hover"]);
  });
});
