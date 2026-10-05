import { describe, it, expect } from "vitest";
import type { PayslipDTO } from "@ledgerly/shared";
import {
  filterPayslips, filterRaisesByVerdict, isPayslipTipoFilter, isRaiseVerdictFilter, periodoOptions, sortByPeriodo,
} from "./salaryFilters.js";
import type { SalaryRaise } from "./salaryRaises.js";

const payslip = (periodo: string, tipo: PayslipDTO["tipo"] = "mensual"): PayslipDTO => ({
  id: `${periodo}-${tipo}`, periodo, tipo, fechaPago: `${periodo}-05`, cuil: "20-1-3", conceptos: [],
  remunerativo: 0, noRemunerativo: 0, descuentos: 0, brutoTotal: 0, neto: 0,
  costoTotalEmpleador: null, tipoCambioUsd: null, tipoCambioSource: null, netoUsd: null,
});

const raise = (periodo: string, verdict: SalaryRaise["verdict"]): SalaryRaise => ({
  periodo, basicoPct: 10, brutoPct: 10, ipcPct: 10, ipcDesde: periodo, ipcHasta: periodo,
  ipcFaltantes: [], realPct: 0, verdict,
});

const ids = (payslips: PayslipDTO[]): string[] => payslips.map((item) => item.id);

const recibos = [
  payslip("2025-11"),
  payslip("2025-12"),
  payslip("2025-12", "sac"),
  payslip("2026-01"),
];

describe("filterPayslips", () => {
  it("sin filtros devuelve todos los recibos", () => {
    expect(ids(filterPayslips(recibos, { tipo: "todos", desde: "", hasta: "" }))).toEqual(
      ["2025-11-mensual", "2025-12-mensual", "2025-12-sac", "2026-01-mensual"],
    );
  });

  it("filtra por tipo de recibo", () => {
    expect(ids(filterPayslips(recibos, { tipo: "sac", desde: "", hasta: "" }))).toEqual(["2025-12-sac"]);
    expect(ids(filterPayslips(recibos, { tipo: "mensual", desde: "", hasta: "" }))).toEqual(
      ["2025-11-mensual", "2025-12-mensual", "2026-01-mensual"],
    );
  });

  it("el rango de meses incluye los dos extremos", () => {
    expect(ids(filterPayslips(recibos, { tipo: "todos", desde: "2025-12", hasta: "2025-12" }))).toEqual(
      ["2025-12-mensual", "2025-12-sac"],
    );
  });

  it("acepta un rango abierto de un solo lado", () => {
    expect(ids(filterPayslips(recibos, { tipo: "todos", desde: "2025-12", hasta: "" }))).toEqual(
      ["2025-12-mensual", "2025-12-sac", "2026-01-mensual"],
    );
    expect(ids(filterPayslips(recibos, { tipo: "todos", desde: "", hasta: "2025-11" }))).toEqual(["2025-11-mensual"]);
  });
});

describe("sortByPeriodo", () => {
  it("ordena del más nuevo al más viejo o al revés sin mutar la lista", () => {
    const desordenados = [payslip("2025-12"), payslip("2026-01"), payslip("2025-11")];
    expect(ids(sortByPeriodo(desordenados, "desc"))).toEqual(["2026-01-mensual", "2025-12-mensual", "2025-11-mensual"]);
    expect(ids(sortByPeriodo(desordenados, "asc"))).toEqual(["2025-11-mensual", "2025-12-mensual", "2026-01-mensual"]);
    expect(ids(desordenados)).toEqual(["2025-12-mensual", "2026-01-mensual", "2025-11-mensual"]);
  });
});

describe("periodoOptions", () => {
  it("lista los períodos sin repetir, del más nuevo al más viejo", () => {
    expect(periodoOptions(recibos)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});

describe("filterRaisesByVerdict", () => {
  const ajustes = [raise("2025-05", "debajo"), raise("2025-09", "ipc"), raise("2026-01", "real")];

  it("con todos no filtra", () => {
    expect(filterRaisesByVerdict(ajustes, "todos").map((item) => item.periodo)).toEqual(["2025-05", "2025-09", "2026-01"]);
  });

  it("deja solo los ajustes con ese veredicto", () => {
    expect(filterRaisesByVerdict(ajustes, "real").map((item) => item.periodo)).toEqual(["2026-01"]);
  });
});

describe("isPayslipTipoFilter", () => {
  it.each([["todos", true], ["mensual", true], ["sac", true], ["aguinaldo", false]])("%s → %s", (value, expected) => {
    expect(isPayslipTipoFilter(value)).toBe(expected);
  });
});

describe("isRaiseVerdictFilter", () => {
  it.each([["todos", true], ["real", true], ["ipc", true], ["debajo", true], ["parcial", true], ["otro", false]])(
    "%s → %s",
    (value, expected) => {
      expect(isRaiseVerdictFilter(value)).toBe(expected);
    },
  );
});
