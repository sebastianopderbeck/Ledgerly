import { describe, it, expect } from "vitest";
import type { CashFlowDTO, CashFlowMonthDTO, PayslipTipo } from "@ledgerly/shared";
import {
  buildCashFlow, incomeByMonth, installmentFloor, projectPlanPayment, statementAmountArs, toCashFlowCard,
  ESTIMADO_SAC, ESTIMADO_SUELDO, FALTA_AUTO, FALTA_COTIZACION, FALTA_HIPOTECA,
  FALTA_RECIBO, FALTA_SAC, estimadoAuto, estimadoHipoteca, estimadoTarjeta, faltaResumen,
  type CashFlowCard, type CashFlowInput, type CashFlowPayslip, type CashFlowPlan, type CashFlowStatement,
} from "./cashFlow.js";

const statement = (overrides: Partial<CashFlowStatement> = {}): CashFlowStatement => ({
  issuer: "visa_signature",
  cardLabel: "Visa Signature",
  closingDate: "2026-09-03",
  dueDate: "2026-09-14",
  saldoArs: 100_000,
  saldoUsd: 0,
  uploadedAt: "2026-09-05T10:00:00.000Z",
  ...overrides,
});

const payslip = (fechaPago: string, neto: number, tipo: PayslipTipo = "mensual"): CashFlowPayslip => ({ fechaPago, tipo, neto });

const TODAY = "2026-10-03";
const NO_PLAN: CashFlowPlan = { coupons: [], cuotasTotales: null, aumentoMensual: 0 };

const input = (overrides: Partial<CashFlowInput> = {}): CashFlowInput => ({
  today: TODAY,
  payslips: [],
  statements: [],
  cards: [],
  mortgage: NO_PLAN,
  auto: NO_PLAN,
  usdRates: [],
  ...overrides,
});

const mesDe = (flow: CashFlowDTO, mes: string): CashFlowMonthDTO | undefined => flow.meses.find((item) => item.mes === mes);

const icbc = (overrides: Partial<CashFlowStatement> = {}): CashFlowStatement =>
  statement({ issuer: "icbc", cardLabel: "ICBC", ...overrides });

const ejemplo = (): CashFlowInput => input({
  payslips: [payslip("2026-08-31", 1_050_000), payslip("2026-09-30", 1_100_000)],
  statements: [
    statement({ closingDate: "2026-08-04", dueDate: "2026-08-14", saldoArs: 420_000 }),
    statement({ closingDate: "2026-09-03", dueDate: "2026-09-14", saldoArs: 450_000, saldoUsd: 20 }),
    statement({ closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 500_000 }),
    icbc({ closingDate: "2026-08-27", dueDate: "2026-09-15", saldoArs: 100_000 }),
  ],
  cards: [
    {
      issuer: "visa_signature",
      cardLabel: "Visa Signature",
      baseMonth: "2026-10",
      installments: [{ amount: 30_000, remaining: 3 }, { amount: 20_000, remaining: 1 }],
    },
    { issuer: "icbc", cardLabel: "ICBC", baseMonth: "2026-09", installments: [{ amount: 10_000, remaining: 2 }] },
  ],
  mortgage: { coupons: [{ fecha: "2026-09-17", cuotaNro: 12, monto: 300_000 }], cuotasTotales: 240, aumentoMensual: 0 },
  auto: { coupons: [{ fecha: "2026-09-10", cuotaNro: 20, monto: 150_000 }], cuotasTotales: 120, aumentoMensual: 0 },
  usdRates: [
    { fecha: "2026-09-12", valor: 1_380 },
    { fecha: "2026-09-14", valor: 1_400 },
    { fecha: "2026-10-02", valor: 1_450 },
  ],
});

const visaMensual = (meses: string[]): CashFlowStatement[] =>
  meses.map((mes) => statement({ closingDate: `${mes}-03`, dueDate: `${mes}-14`, saldoArs: 100_000 }));

const recibosMensuales = (meses: string[]): CashFlowPayslip[] =>
  meses.map((mes) => payslip(`${mes}-28`, 1_000_000));

describe("statementAmountArs", () => {
  it("suma los pesos y los dólares al oficial", () => {
    expect(statementAmountArs({ saldoArs: 450_000, saldoUsd: 20 }, 1_400)).toBe(478_000);
  });

  it("sin cotización suma solo los pesos", () => {
    expect(statementAmountArs({ saldoArs: 450_000, saldoUsd: 20 }, null)).toBe(450_000);
  });

  it("un saldo a favor cuenta 0", () => {
    expect(statementAmountArs({ saldoArs: -5_000, saldoUsd: 0 }, null)).toBe(0);
  });
});

describe("toCashFlowCard", () => {
  it("ancla las cuotas al mes de vencimiento y descarta las que no tienen restantes", () => {
    const card = toCashFlowCard(statement({ closingDate: "2026-10-02", dueDate: "2026-10-13" }), [
      { amount: 30_000, installmentCurrent: 1, installmentTotal: 4 },
      { amount: 20_000, installmentCurrent: 3, installmentTotal: 3 },
      { amount: 5_000, installmentCurrent: null, installmentTotal: null },
    ]);
    expect(card).toEqual({
      issuer: "visa_signature",
      cardLabel: "Visa Signature",
      baseMonth: "2026-10",
      installments: [{ amount: 30_000, remaining: 3 }],
    });
  });

  it("sin vencimiento usa el cierre + 12 días: un cierre el 25/9 vence en octubre", () => {
    expect(toCashFlowCard(statement({ closingDate: "2026-09-25", dueDate: null }), [])?.baseMonth).toBe("2026-10");
  });

  it("sin fechas devuelve null", () => {
    expect(toCashFlowCard(statement({ closingDate: null, dueDate: null }), [])).toBeNull();
  });
});

describe("installmentFloor", () => {
  const card: CashFlowCard = {
    issuer: "visa_signature",
    cardLabel: "Visa Signature",
    baseMonth: "2026-10",
    installments: [{ amount: 30_000, remaining: 3 }, { amount: 20_000, remaining: 1 }],
  };

  it("en el mes del último resumen y antes da 0", () => {
    expect(installmentFloor(card, "2026-10")).toBe(0);
    expect(installmentFloor(card, "2026-09")).toBe(0);
  });

  it("suma las cuotas a las que todavía les quedan k meses", () => {
    expect(installmentFloor(card, "2026-11")).toBe(50_000);
    expect(installmentFloor(card, "2026-12")).toBe(30_000);
    expect(installmentFloor(card, "2027-01")).toBe(30_000);
    expect(installmentFloor(card, "2027-02")).toBe(0);
  });
});

describe("projectPlanPayment", () => {
  const plan: CashFlowPlan = {
    coupons: [
      { fecha: "2026-08-17", cuotaNro: 11, monto: 290_000 },
      { fecha: "2026-09-17", cuotaNro: 12, monto: 300_000 },
    ],
    cuotasTotales: 14, aumentoMensual: 0,
  };

  it("repite la última cuota en los meses siguientes", () => {
    expect(projectPlanPayment(plan, "2026-10")).toBe(300_000);
    expect(projectPlanPayment(plan, "2026-11")).toBe(300_000);
  });

  it("no proyecta el mes de la última cuota ni los anteriores", () => {
    expect(projectPlanPayment(plan, "2026-09")).toBe(0);
    expect(projectPlanPayment(plan, "2026-08")).toBe(0);
  });

  it("deja de proyectar después de la última cuota del plan", () => {
    expect(projectPlanPayment(plan, "2026-12")).toBe(0);
  });

  it("sin cuotas totales proyecta siempre, y sin cupones da 0", () => {
    expect(projectPlanPayment({ ...plan, cuotasTotales: null }, "2030-01")).toBe(300_000);
    expect(projectPlanPayment({ coupons: [], cuotasTotales: null, aumentoMensual: 0 }, "2026-10")).toBe(0);
  });

  it("compone el aumento mensual por cada mes desde el último cupón", () => {
    const conAumento = { ...plan, aumentoMensual: 0.02 };
    expect(projectPlanPayment(conAumento, "2026-10")).toBeCloseTo(306_000, 6);
    expect(projectPlanPayment(conAumento, "2026-11")).toBeCloseTo(312_120, 6);
  });
});

describe("etiquetas de la hipoteca y el auto estimados", () => {
  it("sin aumento dicen que repiten la última cuota", () => {
    expect(estimadoHipoteca(0)).toBe("Hipoteca (última cuota)");
    expect(estimadoAuto(0)).toBe("Auto (último cupón)");
  });

  it("con aumento muestran el porcentaje mensual", () => {
    expect(estimadoHipoteca(0.0198)).toBe("Hipoteca (última cuota +2,0% por mes)");
    expect(estimadoAuto(0.0229)).toBe("Auto (último cupón +2,3% por mes)");
  });
});

describe("incomeByMonth", () => {
  it("agrupa los recibos por el mes de pago", () => {
    const mensual = payslip("2026-06-30", 1_000_000);
    const sac = payslip("2026-06-30", 500_000, "sac");
    const julio = payslip("2026-07-31", 1_050_000);
    const byMonth = incomeByMonth([mensual, sac, julio]);
    expect(byMonth.get("2026-06")).toEqual([mensual, sac]);
    expect(byMonth.get("2026-07")).toEqual([julio]);
  });
});

describe("buildCashFlow: rango", () => {
  it("sin recibos, sin resúmenes o sin resúmenes con fecha no hay flujo", () => {
    const vacio = { mesActual: "2026-10", meses: [] };
    expect(buildCashFlow(input({ statements: [statement()] }))).toEqual(vacio);
    expect(buildCashFlow(input({ payslips: [payslip("2026-09-30", 1)] }))).toEqual(vacio);
    expect(buildCashFlow(input({
      payslips: [payslip("2026-09-30", 1)],
      statements: [statement({ closingDate: null, dueDate: null })],
    }))).toEqual(vacio);
  });

  it("la historia arranca en el mayor de los dos primeros meses y termina en el mes anterior al actual", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]),
      statements: visaMensual(["2026-07", "2026-08", "2026-09"]),
    }));
    expect(flow.meses.map((mes) => mes.mes)).toEqual([
      "2026-07", "2026-08", "2026-09",
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]);
    expect(flow.meses.filter((mes) => mes.mes < "2026-10").every((mes) => mes.estado === "completo" || mes.estado === "incompleto")).toBe(true);
  });
});

describe("buildCashFlow: meses cerrados", () => {
  it("arma el mes completo del ejemplo", () => {
    expect(mesDe(buildCashFlow(ejemplo()), "2026-09")).toEqual({
      mes: "2026-09",
      estado: "completo",
      ingreso: 1_100_000,
      conSac: false,
      tarjetas: 578_000,
      hipoteca: 300_000,
      auto: 150_000,
      egresos: 1_028_000,
      margen: 72_000,
      tasaAhorro: 72_000 / 1_100_000,
      faltantes: [],
      estimados: [],
    });
  });

  it("no espera una tarjeta, la hipoteca ni el auto antes de su primer mes", () => {
    expect(mesDe(buildCashFlow(ejemplo()), "2026-08")).toMatchObject({
      estado: "completo", tarjetas: 420_000, hipoteca: 0, auto: 0, margen: 630_000, faltantes: [],
    });
  });

  it("suma el recibo mensual y el SAC del mismo mes", () => {
    const flow = buildCashFlow(input({
      today: "2026-07-03",
      payslips: [payslip("2026-06-30", 1_000_000), payslip("2026-06-30", 500_000, "sac")],
      statements: visaMensual(["2026-06"]),
    }));
    expect(mesDe(flow, "2026-06")).toMatchObject({ estado: "completo", ingreso: 1_500_000, conSac: true, margen: 1_400_000 });
  });

  it("un mes sin recibo queda incompleto, sin margen ni tasa, pero con los montos conocidos", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-07", "2026-09"]),
      statements: visaMensual(["2026-07", "2026-08", "2026-09"]),
    }));
    expect(mesDe(flow, "2026-08")).toMatchObject({
      estado: "incompleto", ingreso: null, tarjetas: 100_000, egresos: 100_000, margen: null, tasaAhorro: null,
      faltantes: [FALTA_RECIBO],
    });
  });

  it("junio sin SAC lista el recibo del SAC", () => {
    const flow = buildCashFlow(input({
      today: "2026-07-03",
      payslips: [payslip("2026-06-30", 1_000_000)],
      statements: visaMensual(["2026-06"]),
    }));
    expect(mesDe(flow, "2026-06")).toMatchObject({ estado: "incompleto", ingreso: 1_000_000, margen: null, faltantes: [FALTA_SAC] });
  });

  it("imputa la tarjeta por el mes de vencimiento, sin vencimiento por cierre + 12 días, y sin fechas la ignora", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: [
        statement({ closingDate: "2026-08-30", dueDate: "2026-09-09", saldoArs: 100_000 }),
        icbc({ closingDate: "2026-09-25", dueDate: null, saldoArs: 70_000 }),
        icbc({ closingDate: null, dueDate: null, saldoArs: 999_999 }),
      ],
    }));
    expect(mesDe(flow, "2026-09")).toMatchObject({ estado: "completo", tarjetas: 100_000 });
    expect(mesDe(flow, "2026-10")?.tarjetas).toBe(70_000);
  });

  it("dos resúmenes de la misma tarjeta que vencen en el mismo mes se suman", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: [
        statement({ closingDate: "2026-08-20", dueDate: "2026-09-01", saldoArs: 100_000 }),
        statement({ closingDate: "2026-09-18", dueDate: "2026-09-30", saldoArs: 120_000 }),
      ],
    }));
    expect(mesDe(flow, "2026-09")?.tarjetas).toBe(220_000);
  });

  it("dos documentos del mismo resumen cuentan una vez: el subido último", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: [
        statement({ saldoArs: 450_000, uploadedAt: "2026-09-05T10:00:00.000Z" }),
        statement({ saldoArs: 460_000, uploadedAt: "2026-09-20T10:00:00.000Z" }),
      ],
    }));
    expect(mesDe(flow, "2026-09")?.tarjetas).toBe(460_000);
  });

  it("pasa el saldo en dólares al oficial del vencimiento", () => {
    const flow = buildCashFlow(ejemplo());
    expect(mesDe(flow, "2026-09")?.tarjetas).toBe(450_000 + 20 * 1_400 + 100_000);
  });

  it("sin cotización suma solo los pesos y lista la cotización del dólar", () => {
    const flow = buildCashFlow({ ...ejemplo(), usdRates: [] });
    expect(mesDe(flow, "2026-09")).toMatchObject({
      estado: "incompleto", tarjetas: 550_000, margen: null, faltantes: [FALTA_COTIZACION],
    });
  });

  it("un saldo a favor cuenta 0 sin dejar el mes incompleto", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: [statement({ saldoArs: -5_000 })],
    }));
    expect(mesDe(flow, "2026-09")).toMatchObject({ estado: "completo", tarjetas: 0, margen: 1_000_000 });
  });

  it("imputa hipoteca y auto por su fecha y suma dos cupones del mismo mes", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-09"]),
      statements: visaMensual(["2026-09"]),
      mortgage: {
        coupons: [{ fecha: "2026-09-01", cuotaNro: 5, monto: 100_000 }, { fecha: "2026-09-28", cuotaNro: 6, monto: 110_000 }],
        cuotasTotales: 240, aumentoMensual: 0,
      },
      auto: { coupons: [{ fecha: "2026-09-10", cuotaNro: 20, monto: 150_000 }], cuotasTotales: 120, aumentoMensual: 0 },
    }));
    expect(mesDe(flow, "2026-09")).toMatchObject({ hipoteca: 210_000, auto: 150_000, egresos: 460_000 });
  });

  it("una tarjeta que ya empezó y no tiene resumen en el mes lo lista como faltante", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-07", "2026-08", "2026-09"]),
      statements: [...visaMensual(["2026-07", "2026-08", "2026-09"]), icbc({ closingDate: "2026-07-28", dueDate: "2026-08-10" })],
    }));
    expect(mesDe(flow, "2026-07")?.faltantes).toEqual([]);
    expect(mesDe(flow, "2026-08")?.faltantes).toEqual([]);
    expect(mesDe(flow, "2026-09")?.faltantes).toEqual([faltaResumen("ICBC")]);
  });

  it("la hipoteca y el auto que ya empezaron y no tienen cupón en el mes se listan como faltantes", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-07", "2026-08", "2026-09"]),
      statements: visaMensual(["2026-07", "2026-08", "2026-09"]),
      mortgage: { coupons: [{ fecha: "2026-08-17", cuotaNro: 1, monto: 300_000 }], cuotasTotales: 240, aumentoMensual: 0 },
      auto: {
        coupons: [{ fecha: "2026-07-10", cuotaNro: 19, monto: 150_000 }, { fecha: "2026-09-10", cuotaNro: 21, monto: 150_000 }],
        cuotasTotales: 120, aumentoMensual: 0,
      },
    }));
    expect(mesDe(flow, "2026-07")?.faltantes).toEqual([]);
    expect(mesDe(flow, "2026-08")?.faltantes).toEqual([FALTA_AUTO]);
    expect(mesDe(flow, "2026-09")?.faltantes).toEqual([FALTA_HIPOTECA]);
  });

  it("un plan terminado deja de esperarse", () => {
    const flow = buildCashFlow(input({
      payslips: recibosMensuales(["2026-07", "2026-08", "2026-09"]),
      statements: visaMensual(["2026-07", "2026-08", "2026-09"]),
      mortgage: { coupons: [{ fecha: "2026-07-17", cuotaNro: 24, monto: 300_000 }], cuotasTotales: 24, aumentoMensual: 0 },
    }));
    expect(mesDe(flow, "2026-08")).toMatchObject({ estado: "completo", hipoteca: 0, faltantes: [] });
    expect(mesDe(flow, "2026-09")).toMatchObject({ estado: "completo", hipoteca: 0, faltantes: [] });
  });
});

describe("buildCashFlow: proyección", () => {
  const resumen = ({ mes, estado, ingreso, tarjetas, hipoteca, auto, margen }: CashFlowMonthDTO) =>
    ({ mes, estado, ingreso, tarjetas, hipoteca, auto, margen });

  it("reproduce la proyección del ejemplo", () => {
    const flow = buildCashFlow(ejemplo());
    expect(flow.meses.filter((mes) => mes.mes >= "2026-10").map(resumen)).toEqual([
      { mes: "2026-10", estado: "en_curso", ingreso: 1_100_000, tarjetas: 510_000, hipoteca: 300_000, auto: 150_000, margen: 140_000 },
      { mes: "2026-11", estado: "proyectado", ingreso: 1_100_000, tarjetas: 60_000, hipoteca: 300_000, auto: 150_000, margen: 590_000 },
      { mes: "2026-12", estado: "proyectado", ingreso: 1_650_000, tarjetas: 30_000, hipoteca: 300_000, auto: 150_000, margen: 1_170_000 },
      { mes: "2027-01", estado: "proyectado", ingreso: 1_100_000, tarjetas: 30_000, hipoteca: 300_000, auto: 150_000, margen: 620_000 },
      { mes: "2027-02", estado: "proyectado", ingreso: 1_100_000, tarjetas: 0, hipoteca: 300_000, auto: 150_000, margen: 650_000 },
      { mes: "2027-03", estado: "proyectado", ingreso: 1_100_000, tarjetas: 0, hipoteca: 300_000, auto: 150_000, margen: 650_000 },
    ]);
  });

  it("proyecta la hipoteca y el auto con su aumento mensual y lo anota", () => {
    const base = ejemplo();
    const flow = buildCashFlow({
      ...base,
      mortgage: { ...base.mortgage, aumentoMensual: 0.02 },
      auto: { ...base.auto, aumentoMensual: 0.05 },
    });
    expect(mesDe(flow, "2026-10")?.hipoteca).toBeCloseTo(306_000, 6);
    expect(mesDe(flow, "2026-10")?.auto).toBeCloseTo(157_500, 6);
    expect(mesDe(flow, "2026-10")?.margen).toBeCloseTo(126_500, 6);
    expect(mesDe(flow, "2026-11")?.hipoteca).toBeCloseTo(312_120, 6);
    expect(mesDe(flow, "2026-11")?.auto).toBeCloseTo(165_375, 6);
    expect(mesDe(flow, "2026-10")?.estimados).toEqual([
      ESTIMADO_SUELDO, estimadoTarjeta("ICBC"), "Hipoteca (última cuota +2,0% por mes)", "Auto (último cupón +5,0% por mes)",
    ]);
  });

  it("anota qué parte de cada mes es estimada", () => {
    const flow = buildCashFlow(ejemplo());
    expect(mesDe(flow, "2026-10")).toMatchObject({
      faltantes: [],
      estimados: [ESTIMADO_SUELDO, estimadoTarjeta("ICBC"), estimadoHipoteca(0), estimadoAuto(0)],
      tasaAhorro: 140_000 / 1_100_000,
    });
    expect(mesDe(flow, "2026-12")).toMatchObject({
      conSac: true,
      estimados: [ESTIMADO_SUELDO, ESTIMADO_SAC, estimadoTarjeta("Visa Signature"), estimadoTarjeta("ICBC"), estimadoHipoteca(0), estimadoAuto(0)],
    });
    expect(mesDe(flow, "2026-11")?.conSac).toBe(false);
  });

  it("una tarjeta sin cuotas pendientes se estima en 0 pero queda anotada", () => {
    const flow = buildCashFlow(ejemplo());
    expect(mesDe(flow, "2027-02")?.estimados).toContain(estimadoTarjeta("Visa Signature"));
  });

  it("usa lo real que ya está importado y lo toma como último neto", () => {
    const base = ejemplo();
    const flow = buildCashFlow({
      ...base,
      payslips: [...base.payslips, payslip("2026-10-31", 1_200_000)],
      mortgage: { ...base.mortgage, coupons: [...base.mortgage.coupons, { fecha: "2026-10-16", cuotaNro: 13, monto: 310_000 }] },
    });
    expect(mesDe(flow, "2026-10")).toMatchObject({ ingreso: 1_200_000, hipoteca: 310_000 });
    expect(mesDe(flow, "2026-10")?.estimados).toEqual([estimadoTarjeta("ICBC"), estimadoAuto(0)]);
    expect(mesDe(flow, "2026-11")).toMatchObject({ ingreso: 1_200_000, hipoteca: 310_000 });
  });

  it("un plan terminado no se proyecta", () => {
    const flow = buildCashFlow({
      ...ejemplo(),
      mortgage: { coupons: [{ fecha: "2026-09-17", cuotaNro: 24, monto: 300_000 }], cuotasTotales: 24, aumentoMensual: 0 },
    });
    expect(mesDe(flow, "2026-10")?.hipoteca).toBe(0);
    expect(mesDe(flow, "2026-10")?.estimados).not.toContain(estimadoHipoteca(0));
  });

  it("sin cotización para un saldo en USD lista la cotización pero calcula el margen", () => {
    const base = ejemplo();
    const flow = buildCashFlow({
      ...base,
      statements: [...base.statements.slice(0, 2), statement({ closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 500_000, saldoUsd: 10 }), base.statements[3]],
      usdRates: [],
    });
    expect(mesDe(flow, "2026-10")).toMatchObject({ tarjetas: 510_000, margen: 140_000, faltantes: [FALTA_COTIZACION] });
  });

  it("con el vencimiento en el futuro usa la cotización de hoy", () => {
    const base = ejemplo();
    const flow = buildCashFlow({
      ...base,
      statements: [...base.statements.slice(0, 2), statement({ closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 500_000, saldoUsd: 10 }), base.statements[3]],
      usdRates: [...base.usdRates, { fecha: "2026-10-13", valor: 1_500 }],
    });
    expect(mesDe(flow, "2026-10")?.tarjetas).toBe(500_000 + 10 * 1_450 + 10_000);
  });

  it("una tarjeta que todavía no empezó no se proyecta", () => {
    const base = ejemplo();
    const flow = buildCashFlow({
      ...base,
      statements: [...base.statements, statement({ issuer: "nueva", cardLabel: "Nueva", closingDate: "2026-10-30", dueDate: "2026-11-10", saldoArs: 80_000 })],
    });
    expect(mesDe(flow, "2026-10")?.estimados).not.toContain(estimadoTarjeta("Nueva"));
    expect(mesDe(flow, "2026-11")?.tarjetas).toBe(60_000 + 80_000);
    expect(mesDe(flow, "2026-12")?.estimados).toContain(estimadoTarjeta("Nueva"));
  });

  it("respeta el horizonte pedido", () => {
    const flow = buildCashFlow({ ...ejemplo(), horizon: 3 });
    expect(flow.meses.filter((mes) => mes.mes >= "2026-10").map((mes) => mes.mes)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});
