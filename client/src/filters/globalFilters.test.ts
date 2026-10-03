import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ALL_YEARS, filterInYears, globalSearch, matchesYears, parseYearKey, parseYears, resolveYearChange,
  writeYears, yearKeyOf, yearOptionsWith, yearsForApi, yearsLabel, yearsOf, type YearSelection,
} from "./globalFilters.js";

const ALL: YearSelection = { kind: "all" };
const only = (...years: string[]): YearSelection => ({ kind: "years", years });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
});
afterEach(() => vi.useRealTimers());

describe("parseYears", () => {
  it("sin valores toma el año actual", () => {
    expect(parseYears([])).toEqual(only("2026"));
  });

  it("con all devuelve todos", () => {
    expect(parseYears([ALL_YEARS])).toEqual(ALL);
  });

  it("ordena y deduplica varios años", () => {
    expect(parseYears(["2026", "2024", "2026"])).toEqual(only("2024", "2026"));
  });

  it("ignora valores inválidos", () => {
    expect(parseYears(["abc", "2025", "25"])).toEqual(only("2025"));
  });

  it("si ninguno es válido vuelve al año actual", () => {
    expect(parseYears(["abc"])).toEqual(only("2026"));
  });
});

describe("matchesYears", () => {
  it("compara el año de fechas y de períodos", () => {
    expect(matchesYears("2025-08-18", only("2025"))).toBe(true);
    expect(matchesYears("2025-08", only("2026"))).toBe(false);
  });

  it("con todos deja pasar todo", () => {
    expect(matchesYears("1999-01", ALL)).toBe(true);
  });
});

describe("filterInYears", () => {
  it("filtra por la fecha que devuelve el selector", () => {
    const items = [{ fecha: "2025-01-10" }, { fecha: "2026-02-10" }];
    expect(filterInYears(items, (item) => item.fecha, only("2026"))).toEqual([{ fecha: "2026-02-10" }]);
  });

  it("sin datos devuelve undefined", () => {
    expect(filterInYears<{ fecha: string }>(undefined, (item) => item.fecha, ALL)).toBeUndefined();
  });
});

describe("yearsForApi", () => {
  it("con todos no manda años", () => {
    expect(yearsForApi(ALL)).toBeUndefined();
  });

  it("con años concretos los manda tal cual", () => {
    expect(yearsForApi(only("2025", "2026"))).toEqual(["2025", "2026"]);
  });
});

describe("resolveYearChange", () => {
  it("elegir Todos estando en años pasa a todos", () => {
    expect(resolveYearChange(only("2026"), ["2026", ALL_YEARS])).toEqual(ALL);
  });

  it("elegir un año estando en Todos deja solo ese año", () => {
    expect(resolveYearChange(ALL, [ALL_YEARS, "2025"])).toEqual(only("2025"));
  });

  it("agregar un año suma y ordena", () => {
    expect(resolveYearChange(only("2026"), ["2026", "2024"])).toEqual(only("2024", "2026"));
  });

  it("destildar el último año vuelve a todos", () => {
    expect(resolveYearChange(only("2026"), [])).toEqual(ALL);
  });
});

describe("yearOptionsWith", () => {
  it("suma el año actual y los elegidos, de más nuevo a más viejo", () => {
    expect(yearOptionsWith(["2024", "2025"], only("2019"))).toEqual(["2026", "2025", "2024", "2019"]);
  });
});

describe("yearsOf", () => {
  it("extrae los años únicos ordenados", () => {
    expect(yearsOf(["2026-01", "2025-12-31", "2026-03"])).toEqual(["2025", "2026"]);
  });
});

describe("yearsLabel", () => {
  it("nombra uno, dos o varios años en castellano", () => {
    expect(yearsLabel(["2025"])).toBe("2025");
    expect(yearsLabel(["2025", "2026"])).toBe("2025 y 2026");
    expect(yearsLabel(["2024", "2025", "2026"])).toBe("2024, 2025 y 2026");
  });
});

describe("writeYears", () => {
  it("escribe años repetidos o all, sin tocar el resto", () => {
    const params = new URLSearchParams("year=2020&currency=USD");
    writeYears(params, only("2025", "2026"));
    expect(params.toString()).toBe("currency=USD&year=2025&year=2026");
    writeYears(params, ALL);
    expect(params.getAll("year")).toEqual(["all"]);
  });
});

describe("globalSearch", () => {
  it("conserva los filtros globales y descarta los de Movimientos", () => {
    const params = new URLSearchParams(
      "year=2025&year=2026&currency=USD&cardLabel=ICBC&from=2026-02-01&to=2026-02-28&category=Compras&search=uber&installment=true",
    );
    expect(globalSearch(params)).toBe("?year=2025&year=2026&currency=USD&cardLabel=ICBC&from=2026-02-01&to=2026-02-28");
  });

  it("sin filtros globales devuelve vacío", () => {
    expect(globalSearch(new URLSearchParams("category=Compras"))).toBe("");
  });
});

describe("yearKeyOf", () => {
  it("une los años de la URL", () => {
    expect(yearKeyOf(new URLSearchParams("year=2025&year=2026"))).toBe("2025,2026");
  });

  it("sin year toma el año del Mes elegido", () => {
    expect(yearKeyOf(new URLSearchParams("from=2025-11-01&to=2025-11-30"))).toBe("2025");
  });

  it("con year explícito no lo pisa el Mes", () => {
    expect(yearKeyOf(new URLSearchParams("year=2026&from=2025-11-01&to=2025-11-30"))).toBe("2026");
  });

  it("sin year ni Mes queda vacío", () => {
    expect(yearKeyOf(new URLSearchParams("currency=USD"))).toBe("");
  });
});

describe("parseYearKey", () => {
  it("vacío es el año actual", () => {
    expect(parseYearKey("")).toEqual(only("2026"));
  });

  it("separa por coma y respeta all", () => {
    expect(parseYearKey("2026,2025")).toEqual(only("2025", "2026"));
    expect(parseYearKey("all")).toEqual(ALL);
  });
});
