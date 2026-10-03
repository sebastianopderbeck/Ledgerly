import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useGlobalFilters } from "./useGlobalFilters.js";

const renderAt = (route: string) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  );
  return renderHook(() => ({ filters: useGlobalFilters(), location: useLocation() }), { wrapper });
};

const paramsOf = (search: string) => new URLSearchParams(search);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useGlobalFilters", () => {
  it("sin params usa el año actual, ARS y todas las tarjetas", () => {
    const { result } = renderAt("/");
    expect(result.current.filters.years).toEqual(["2026"]);
    expect(result.current.filters.currency).toBe("ARS");
    expect(result.current.filters.cardLabel).toBeUndefined();
  });

  it("con year=all no manda años a la API", () => {
    const { result } = renderAt("/?year=all");
    expect(result.current.filters.yearSelection).toEqual({ kind: "all" });
    expect(result.current.filters.years).toBeUndefined();
  });

  it("mantiene la misma selección de años entre renders", () => {
    const { result, rerender } = renderAt("/?year=2025");
    const first = result.current.filters.yearSelection;
    rerender();
    expect(result.current.filters.yearSelection).toBe(first);
  });

  it("setMonth escribe el rango completo del mes", () => {
    const { result } = renderAt("/?year=2026");
    act(() => result.current.filters.setMonth("2026-02"));
    const params = paramsOf(result.current.location.search);
    expect(params.get("from")).toBe("2026-02-01");
    expect(params.get("to")).toBe("2026-02-28");
  });

  it("setYears limpia el Mes si queda fuera de los años elegidos", () => {
    const { result } = renderAt("/?year=2025&year=2026&from=2025-11-01&to=2025-11-30");
    act(() => result.current.filters.setYears({ kind: "years", years: ["2026"] }));
    const params = paramsOf(result.current.location.search);
    expect(params.getAll("year")).toEqual(["2026"]);
    expect(params.get("from")).toBeNull();
    expect(params.get("to")).toBeNull();
  });

  it("setYears conserva el Mes si sigue dentro de los años elegidos", () => {
    const { result } = renderAt("/?year=2026&from=2026-02-01&to=2026-02-28");
    act(() => result.current.filters.setYears({ kind: "years", years: ["2025", "2026"] }));
    expect(paramsOf(result.current.location.search).get("from")).toBe("2026-02-01");
  });

  it("setCardLabel vacío vuelve a todas las tarjetas", () => {
    const { result } = renderAt("/?cardLabel=ICBC");
    act(() => result.current.filters.setCardLabel(""));
    expect(result.current.filters.cardLabel).toBeUndefined();
  });
});
