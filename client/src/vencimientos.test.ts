import { describe, it, expect } from "vitest";
import {
  ajustarFinDeSemana, desplazamientoTipico, estaDesactualizada, proyectarFechas, rangoDesde, type RangoFechas,
} from "./vencimientos.js";

const RANGO: RangoFechas = { desde: "2026-10-03", hasta: "2026-12-31" };

describe("rangoDesde", () => {
  it("va de hoy al último día del mes subsiguiente", () => {
    expect(rangoDesde("2026-10-03")).toEqual(RANGO);
  });

  it("cruza el año", () => {
    expect(rangoDesde("2026-12-15")).toEqual({ desde: "2026-12-15", hasta: "2027-02-28" });
  });
});

describe("desplazamientoTipico", () => {
  it("es la mediana de los días contra el 1° del mes ancla", () => {
    expect(desplazamientoTipico([
      { mes: "2026-08", fecha: "2026-08-13" },
      { mes: "2026-09", fecha: "2026-09-14" },
      { mes: "2026-10", fecha: "2026-10-13" },
    ])).toBe(12);
  });

  it("con cantidad par promedia las dos del medio y redondea", () => {
    expect(desplazamientoTipico([
      { mes: "2026-07", fecha: "2026-07-05" },
      { mes: "2026-08", fecha: "2026-08-06" },
      { mes: "2026-09", fecha: "2026-09-09" },
      { mes: "2026-10", fecha: "2026-10-11" },
    ])).toBe(7);
  });

  it("usa solo las últimas 6, aunque lleguen desordenadas", () => {
    expect(desplazamientoTipico([
      { mes: "2026-07", fecha: "2026-07-10" },
      { mes: "2026-01", fecha: "2026-01-02" },
      { mes: "2026-06", fecha: "2026-06-10" },
      { mes: "2026-02", fecha: "2026-02-02" },
      { mes: "2026-05", fecha: "2026-05-10" },
      { mes: "2026-03", fecha: "2026-03-02" },
      { mes: "2026-04", fecha: "2026-04-02" },
    ])).toBe(5);
  });

  it("deduplica por mes quedándose con la fecha mayor", () => {
    expect(desplazamientoTipico([
      { mes: "2026-09", fecha: "2026-09-03" },
      { mes: "2026-09", fecha: "2026-09-20" },
    ])).toBe(19);
  });

  it("admite desplazamientos negativos", () => {
    expect(desplazamientoTipico([{ mes: "2026-08", fecha: "2026-07-31" }])).toBe(-1);
  });

  it("sin ocurrencias es null", () => {
    expect(desplazamientoTipico([])).toBeNull();
  });
});

describe("ajustarFinDeSemana", () => {
  it("hacia adelante lleva sábado y domingo al lunes", () => {
    expect(ajustarFinDeSemana("2026-11-14", "adelante")).toBe("2026-11-16");
    expect(ajustarFinDeSemana("2026-12-13", "adelante")).toBe("2026-12-14");
  });

  it("hacia atrás lleva sábado y domingo al viernes", () => {
    expect(ajustarFinDeSemana("2026-10-31", "atras")).toBe("2026-10-30");
    expect(ajustarFinDeSemana("2026-11-01", "atras")).toBe("2026-10-30");
  });

  it("un día hábil queda igual", () => {
    expect(ajustarFinDeSemana("2026-10-14", "adelante")).toBe("2026-10-14");
    expect(ajustarFinDeSemana("2026-10-14", "atras")).toBe("2026-10-14");
  });
});

describe("proyectarFechas", () => {
  it("proyecta un mes por paso y corta al pasar el final del rango", () => {
    const ocurrencias = [
      { mes: "2026-08", fecha: "2026-08-13" },
      { mes: "2026-09", fecha: "2026-09-14" },
      { mes: "2026-10", fecha: "2026-10-13" },
    ];
    expect(proyectarFechas(ocurrencias, RANGO, "adelante")).toEqual([
      { mes: "2026-11", fecha: "2026-11-13", paso: 1 },
      { mes: "2026-12", fecha: "2026-12-14", paso: 2 },
    ]);
  });

  it("descarta los meses que ya pasaron y numera los pasos desde el último documento", () => {
    expect(proyectarFechas([{ mes: "2026-08", fecha: "2026-08-14" }], RANGO, "adelante")).toEqual([
      { mes: "2026-10", fecha: "2026-10-14", paso: 2 },
      { mes: "2026-11", fecha: "2026-11-16", paso: 3 },
      { mes: "2026-12", fecha: "2026-12-14", paso: 4 },
    ]);
  });

  it("un 31 en un mes más corto usa el último día y después corre el fin de semana", () => {
    const rango = { desde: "2027-02-01", hasta: "2027-03-31" };
    expect(proyectarFechas([{ mes: "2027-01", fecha: "2027-01-31" }], rango, "adelante")).toEqual([
      { mes: "2027-02", fecha: "2027-03-01", paso: 1 },
      { mes: "2027-03", fecha: "2027-03-31", paso: 2 },
    ]);
  });

  it("con corrimiento hacia atrás el ancla de enero puede caer en diciembre", () => {
    const rango = { desde: "2027-10-04", hasta: "2027-12-31" };
    expect(proyectarFechas([{ mes: "2027-10", fecha: "2027-10-01" }], rango, "atras")).toEqual([
      { mes: "2027-11", fecha: "2027-11-01", paso: 1 },
      { mes: "2027-12", fecha: "2027-12-01", paso: 2 },
      { mes: "2028-01", fecha: "2027-12-31", paso: 3 },
    ]);
  });

  it("sin ocurrencias no proyecta nada", () => {
    expect(proyectarFechas([], RANGO, "adelante")).toEqual([]);
  });
});

describe("estaDesactualizada", () => {
  it("un último documento de hace 3 meses todavía se proyecta", () => {
    expect(estaDesactualizada("2026-07", "2026-10-03")).toBe(false);
  });

  it("uno de hace 4 meses ya no", () => {
    expect(estaDesactualizada("2026-06", "2026-10-03")).toBe(true);
  });
});
