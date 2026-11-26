import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  activeFilterCount, filtersButtonLabel, filtersSummary, hasSearchFilter, hiddenFilterCount, isCompactFilters, type FilterField,
} from "./activeFilters.js";

const DASHBOARD: FilterField[] = ["year", "currency", "card", "month"];
const INSTALLMENTS: FilterField[] = ["year", "currency", "card"];
const TRANSACTIONS: FilterField[] = ["year", "currency", "card", "month", "transaction"];
const YEAR_ONLY: FilterField[] = ["year"];

const params = (search: string) => new URLSearchParams(search);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
});
afterEach(() => vi.useRealTimers());

describe("activeFilterCount", () => {
  it("sin params no hay filtros activos", () => {
    expect(activeFilterCount(params(""), TRANSACTIONS)).toBe(0);
  });

  it("el año actual y ARS escritos en la URL siguen siendo el default", () => {
    expect(activeFilterCount(params("year=2026&currency=ARS"), DASHBOARD)).toBe(0);
  });

  it("otro año, Todos o varios años cuentan como un filtro", () => {
    expect(activeFilterCount(params("year=2025"), YEAR_ONLY)).toBe(1);
    expect(activeFilterCount(params("year=all"), YEAR_ONLY)).toBe(1);
    expect(activeFilterCount(params("year=2025&year=2026"), YEAR_ONLY)).toBe(1);
  });

  it("USD, una tarjeta y un Mes cuentan uno cada uno", () => {
    expect(activeFilterCount(params("year=2026&currency=USD&cardLabel=ICBC&from=2026-02-01&to=2026-02-28"), DASHBOARD)).toBe(3);
  });

  it("un Mes de otro año sin year cuenta también el Año, como lo muestra el campo", () => {
    expect(activeFilterCount(params("from=2025-11-01&to=2025-11-30"), DASHBOARD)).toBe(2);
  });

  it("categorías, cuotas y búsqueda cuentan uno cada uno, sin importar cuántas categorías", () => {
    expect(activeFilterCount(params("category=Compras&category=Salud&category=Viajes&installment=false&search=uber"), TRANSACTIONS)).toBe(3);
  });

  it("ignora los filtros que la sección no muestra", () => {
    expect(activeFilterCount(params("year=2025&currency=USD&cardLabel=ICBC&from=2025-03-01&category=Compras"), YEAR_ONLY)).toBe(1);
    expect(activeFilterCount(params("currency=USD&from=2026-02-01&to=2026-02-28&search=uber"), INSTALLMENTS)).toBe(1);
  });
});

describe("filtersSummary", () => {
  it("muestra año y moneda aunque sean los de siempre", () => {
    expect(filtersSummary(params(""), DASHBOARD)).toBe("2026 · ARS");
  });

  it("suma la tarjeta elegida", () => {
    expect(filtersSummary(params("currency=USD&cardLabel=Visa"), DASHBOARD)).toBe("2026 · USD · Visa");
  });

  it("nombra varios años o Todos", () => {
    expect(filtersSummary(params("year=2025&year=2026"), YEAR_ONLY)).toBe("2025 y 2026");
    expect(filtersSummary(params("year=all"), YEAR_ONLY)).toBe("Todos los años");
  });

  it("con un Mes elegido muestra el mes en lugar del año", () => {
    expect(filtersSummary(params("year=2026&from=2026-02-01&to=2026-02-28"), DASHBOARD)).toBe("Febrero de 2026 · ARS");
  });

  it("donde no hay campo Mes, un from en la URL no cambia el período", () => {
    expect(filtersSummary(params("year=2025&from=2025-11-01&to=2025-11-30"), INSTALLMENTS)).toBe("2025 · ARS");
  });

  it("una categoría se nombra y varias se cuentan", () => {
    expect(filtersSummary(params("category=Compras"), TRANSACTIONS)).toBe("2026 · ARS · Compras");
    expect(filtersSummary(params("category=Compras&category=Salud&category=Viajes"), TRANSACTIONS)).toBe("2026 · ARS · 3 categorías");
  });

  it("nombra el filtro de cuotas", () => {
    expect(filtersSummary(params("installment=true"), TRANSACTIONS)).toBe("2026 · ARS · Solo cuotas");
    expect(filtersSummary(params("installment=false"), TRANSACTIONS)).toBe("2026 · ARS · Sin cuotas");
  });

  it("no repite la búsqueda, que queda a la vista fuera de la hoja", () => {
    expect(filtersSummary(params("search=uber"), TRANSACTIONS)).toBe("2026 · ARS");
  });

  it("solo resume los campos de la sección", () => {
    expect(filtersSummary(params("year=2025&currency=USD&cardLabel=ICBC"), YEAR_ONLY)).toBe("2025");
  });
});

describe("filtersButtonLabel", () => {
  it("dice cuántos filtros hay activos", () => {
    expect(filtersButtonLabel(0)).toBe("Filtros");
    expect(filtersButtonLabel(1)).toBe("Filtros, 1 activo");
    expect(filtersButtonLabel(3)).toBe("Filtros, 3 activos");
  });
});

describe("hasSearchFilter", () => {
  it("solo las secciones con filtros de movimientos tienen buscador", () => {
    expect(hasSearchFilter(["year", "currency", "card", "month", "transaction"])).toBe(true);
    expect(hasSearchFilter(["year", "currency", "card", "month"])).toBe(false);
    expect(hasSearchFilter(["year"])).toBe(false);
  });
});

describe("isCompactFilters", () => {
  it("compacta con búsqueda o con más de un campo", () => {
    expect(isCompactFilters(["year"])).toBe(false);
    expect(isCompactFilters(["transaction"])).toBe(true);
    expect(isCompactFilters(["year", "currency"])).toBe(true);
    expect(isCompactFilters(DASHBOARD)).toBe(true);
  });
});

describe("hiddenFilterCount", () => {
  it("el conteo de filtros ocultos no cuenta la búsqueda", () => {
    const withSearch = params("search=uber&category=Compras");
    expect(activeFilterCount(withSearch, TRANSACTIONS)).toBe(2);
    expect(hiddenFilterCount(withSearch, TRANSACTIONS)).toBe(1);
    expect(hiddenFilterCount(params("search=uber"), TRANSACTIONS)).toBe(0);
  });

  it("sin búsqueda el conteo de ocultos es el mismo", () => {
    expect(hiddenFilterCount(params("year=2025&currency=USD"), DASHBOARD)).toBe(2);
  });
});
