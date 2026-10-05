import { describe, it, expect } from "vitest";
import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";
import { ipcWindowLabel, raiseFor, raiseVerdictLabel, salaryRaises, type SalaryRaise } from "./salaryRaises.js";

interface PayslipInput {
  periodo: string;
  basico: number | null;
  bruto?: number;
  tipo?: PayslipDTO["tipo"];
}

const payslip = ({ periodo, basico, bruto = basico ?? 0, tipo = "mensual" }: PayslipInput): PayslipDTO => ({
  id: `${periodo}-${tipo}`, periodo, tipo, fechaPago: `${periodo}-05`, cuil: "20-1-3",
  conceptos: basico === null ? [] : [{ codigo: "0201", label: "SUELDO", tipo: "remunerativo", monto: basico }],
  remunerativo: bruto, noRemunerativo: 0, descuentos: 0, brutoTotal: bruto, neto: bruto,
  costoTotalEmpleador: null, tipoCambioUsd: null, tipoCambioSource: null, netoUsd: null,
});

const inflation = (rows: [string, number][]): InflationRateDTO[] =>
  rows.map(([periodo, variacionMensual]) => ({ periodo, variacionMensual }));

describe("salaryRaises", () => {
  it("marca como ajuste solo los meses en que cambia el básico", () => {
    const raises = salaryRaises(
      [
        payslip({ periodo: "2025-01", basico: 1000 }),
        payslip({ periodo: "2025-02", basico: 1000 }),
        payslip({ periodo: "2025-03", basico: 1100 }),
        payslip({ periodo: "2025-04", basico: 1100 }),
      ],
      [],
    );
    expect([...raises.keys()]).toEqual(["2025-03"]);
    expect(raises.get("2025-03")?.basicoPct).toBeCloseTo(10, 6);
  });

  it("acumula el IPC desde el ajuste anterior hasta el mes previo al ajuste", () => {
    const raises = salaryRaises(
      [
        payslip({ periodo: "2025-01", basico: 1000 }),
        payslip({ periodo: "2025-03", basico: 1100 }),
      ],
      inflation([["2024-12", 50], ["2025-01", 10], ["2025-02", 10], ["2025-03", 50]]),
    );
    const raise = raises.get("2025-03");
    expect(raise?.ipcPct).toBeCloseTo(21, 6);
    expect(raise?.ipcDesde).toBe("2025-01");
    expect(raise?.ipcHasta).toBe("2025-02");
  });

  it("cada ventana de IPC arranca en el ajuste anterior, no en el primer recibo", () => {
    const raises = salaryRaises(
      [
        payslip({ periodo: "2025-01", basico: 1000 }),
        payslip({ periodo: "2025-02", basico: 1100 }),
        payslip({ periodo: "2025-03", basico: 1100 }),
        payslip({ periodo: "2025-04", basico: 1210 }),
      ],
      inflation([["2025-01", 10], ["2025-02", 5], ["2025-03", 5]]),
    );
    const raise = raises.get("2025-04");
    expect(raise?.ipcDesde).toBe("2025-02");
    expect(raise?.ipcHasta).toBe("2025-03");
    expect(raise?.ipcPct).toBeCloseTo(10.25, 6);
  });

  it("el aumento real descuenta el IPC de forma compuesta", () => {
    const raises = salaryRaises(
      [payslip({ periodo: "2025-01", basico: 1000 }), payslip({ periodo: "2025-02", basico: 1320 })],
      inflation([["2025-01", 20]]),
    );
    expect(raises.get("2025-02")?.realPct).toBeCloseTo(10, 6);
    expect(raises.get("2025-02")?.verdict).toBe("real");
  });

  it.each([
    [1006, "real"],
    [1004, "ipc"],
    [996, "ipc"],
    [994, "debajo"],
  ] as const)("con básico %d contra IPC 0%% el veredicto es %s", (basico, verdict) => {
    const raises = salaryRaises(
      [payslip({ periodo: "2025-01", basico: 1000 }), payslip({ periodo: "2025-02", basico })],
      inflation([["2025-01", 0]]),
    );
    expect(raises.get("2025-02")?.verdict).toBe(verdict);
  });

  it("si falta el IPC de algún mes de la ventana queda parcial y no calcula el aumento real", () => {
    const raises = salaryRaises(
      [payslip({ periodo: "2025-01", basico: 1000 }), payslip({ periodo: "2025-03", basico: 1200 })],
      inflation([["2025-01", 10]]),
    );
    const raise = raises.get("2025-03");
    expect(raise?.verdict).toBe("parcial");
    expect(raise?.ipcFaltantes).toEqual(["2025-02"]);
    expect(raise?.ipcPct).toBeCloseTo(10, 6);
    expect(raise?.realPct).toBeNull();
  });

  it("sin ningún IPC publicado en la ventana el IPC acumulado queda vacío", () => {
    const raises = salaryRaises(
      [payslip({ periodo: "2025-01", basico: 1000 }), payslip({ periodo: "2025-02", basico: 1200 })],
      [],
    );
    expect(raises.get("2025-02")?.ipcPct).toBeNull();
    expect(raises.get("2025-02")?.verdict).toBe("parcial");
  });

  it("el aumento bruto se mide contra el recibo mensual anterior, ignorando el SAC", () => {
    const raises = salaryRaises(
      [
        payslip({ periodo: "2025-06", basico: 1000, bruto: 1500 }),
        payslip({ periodo: "2025-06", basico: null, bruto: 700, tipo: "sac" }),
        payslip({ periodo: "2025-07", basico: 1100, bruto: 1800 }),
      ],
      [],
    );
    expect([...raises.keys()]).toEqual(["2025-07"]);
    expect(raises.get("2025-07")?.brutoPct).toBeCloseTo(20, 6);
  });

  it("sin bruto anterior positivo no informa el aumento bruto", () => {
    const raises = salaryRaises(
      [
        payslip({ periodo: "2025-01", basico: 1000, bruto: 1000 }),
        payslip({ periodo: "2025-02", basico: 1000, bruto: -70 }),
        payslip({ periodo: "2025-03", basico: 1100, bruto: 1100 }),
      ],
      [],
    );
    expect(raises.get("2025-03")?.brutoPct).toBeNull();
  });

  it("un recibo mensual sin básico no corta la comparación con el último básico", () => {
    const raises = salaryRaises(
      [
        payslip({ periodo: "2025-01", basico: 1000 }),
        payslip({ periodo: "2025-02", basico: null, bruto: 900 }),
        payslip({ periodo: "2025-03", basico: 1100 }),
      ],
      [],
    );
    expect([...raises.keys()]).toEqual(["2025-03"]);
    expect(raises.get("2025-03")?.basicoPct).toBeCloseTo(10, 6);
    expect(raises.get("2025-03")?.ipcDesde).toBe("2025-01");
  });

  it("ordena los recibos por período antes de comparar", () => {
    const raises = salaryRaises(
      [payslip({ periodo: "2025-03", basico: 1100 }), payslip({ periodo: "2025-01", basico: 1000 })],
      [],
    );
    expect([...raises.keys()]).toEqual(["2025-03"]);
    expect(raises.get("2025-03")?.basicoPct).toBeCloseTo(10, 6);
  });

  it("con los recibos reales, sep-25 fue solo ajuste por IPC y may-25 quedó debajo", () => {
    const raises = salaryRaises(
      [
        payslip({ periodo: "2025-01", basico: 5337457.79 }),
        payslip({ periodo: "2025-05", basico: 5901093.33 }),
        payslip({ periodo: "2025-09", basico: 6318890.28 }),
      ],
      inflation([
        ["2025-01", 2.2], ["2025-02", 2.4], ["2025-03", 3.7], ["2025-04", 2.8],
        ["2025-05", 1.5], ["2025-06", 1.6], ["2025-07", 1.9], ["2025-08", 1.9],
      ]),
    );
    expect(raises.get("2025-05")?.verdict).toBe("debajo");
    expect(raises.get("2025-05")?.realPct).toBeCloseTo(-0.9, 1);
    expect(raises.get("2025-09")?.verdict).toBe("ipc");
    expect(raises.get("2025-09")?.ipcPct).toBeCloseTo(7.08, 2);
  });
});

const raise = (overrides: Partial<SalaryRaise>): SalaryRaise => ({
  periodo: "2025-05", basicoPct: 10, brutoPct: 10, ipcPct: 10, ipcDesde: "2025-01", ipcHasta: "2025-04",
  ipcFaltantes: [], realPct: 0, verdict: "ipc", ...overrides,
});

describe("raiseVerdictLabel", () => {
  it.each([
    [raise({ verdict: "real", realPct: 4.72 }), "Real +4,7%"],
    [raise({ verdict: "ipc", realPct: 0.1 }), "Solo IPC"],
    [raise({ verdict: "debajo", realPct: -0.99 }), "Debajo −1,0%"],
    [raise({ verdict: "parcial", realPct: null }), "IPC parcial"],
  ])("%#: nombra el veredicto", (input, label) => {
    expect(raiseVerdictLabel(input)).toBe(label);
  });
});

describe("ipcWindowLabel", () => {
  it("nombra el primer y el último mes de la ventana", () => {
    expect(ipcWindowLabel(raise({}))).toBe("2025-01 a 2025-04");
  });

  it("con un solo mes lo nombra una vez", () => {
    expect(ipcWindowLabel(raise({ ipcDesde: "2024-12", ipcHasta: "2024-12" }))).toBe("2024-12");
  });

  it("agrega los meses sin IPC publicado", () => {
    expect(ipcWindowLabel(raise({ ipcFaltantes: ["2025-03", "2025-04"] }))).toBe("2025-01 a 2025-04 · falta 2025-03, 2025-04");
  });
});

describe("raiseFor", () => {
  const raises = salaryRaises(
    [payslip({ periodo: "2025-05", basico: 1000 }), payslip({ periodo: "2025-06", basico: 1100 })],
    [],
  );

  it("devuelve el ajuste del recibo mensual", () => {
    expect(raiseFor(raises, payslip({ periodo: "2025-06", basico: 1100 }))?.periodo).toBe("2025-06");
  });

  it("no le asigna al SAC el ajuste del mensual del mismo mes", () => {
    expect(raiseFor(raises, payslip({ periodo: "2025-06", basico: null, tipo: "sac" }))).toBeUndefined();
  });
});
