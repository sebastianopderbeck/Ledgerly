import { describe, it, expect } from "vitest";
import { formatMoney, formatUva } from "./format.js";
import { autoCoupon, creditCoupon, payslip, statement } from "./testing/vencimientosFixtures.js";
import {
  ajustarFinDeSemana, desplazamientoTipico, estaDesactualizada, estimarCuotaCredito, proyectarFechas, rangoDesde,
  vencimientosDeAuto, vencimientosDeCredito, vencimientosDeSueldo, vencimientosDeTarjetas, type RangoFechas,
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

const resumido = (items: { fecha: string; titulo: string; estado: string; monto: number | null }[]) =>
  items.map(({ fecha, titulo, estado, monto }) => ({ fecha, titulo, estado, monto }));

describe("vencimientosDeTarjetas", () => {
  const visaOctubre = statement({
    id: "visa-10", issuer: "visa_signature", closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 812_000, saldoUsd: 35, minimoArs: 42_000,
  });

  it("un resumen con vencimiento futuro es confirmado, con saldo ARS + USD y el mínimo en el detalle", () => {
    const [fuente] = vencimientosDeTarjetas([visaOctubre], RANGO);
    expect(fuente.etiqueta).toBe("Visa Signature");
    expect(fuente.items[0]).toEqual({
      id: "tarjeta-visa_signature-2026-10-13",
      tipo: "tarjeta",
      sentido: "pago",
      estado: "confirmado",
      fecha: "2026-10-13",
      titulo: "Visa Signature",
      detalle: `Resumen con cierre 02/10 · mín. ${formatMoney(42_000, "ARS")}`,
      monto: 812_000,
      montoUsd: 35,
    });
  });

  it("los meses siguientes se estiman sin monto", () => {
    const [fuente] = vencimientosDeTarjetas([visaOctubre], RANGO);
    expect(fuente.items.slice(1)).toEqual([
      {
        id: "tarjeta-visa_signature-2026-11-13", tipo: "tarjeta", sentido: "pago", estado: "estimado", fecha: "2026-11-13",
        titulo: "Visa Signature", detalle: "Según el último resumen", monto: null, montoUsd: null,
      },
      {
        id: "tarjeta-visa_signature-2026-12-14", tipo: "tarjeta", sentido: "pago", estado: "estimado", fecha: "2026-12-14",
        titulo: "Visa Signature", detalle: "Según el último resumen", monto: null, montoUsd: null,
      },
    ]);
  });

  it("sin cierre dice Resumen importado y sin saldo en dólares no lleva montoUsd", () => {
    const [fuente] = vencimientosDeTarjetas([statement({ id: "icbc-10", issuer: "icbc", dueDate: "2026-10-14", saldoArs: 0 })], RANGO);
    expect(fuente.items[0]).toMatchObject({
      detalle: `Resumen importado · mín. ${formatMoney(0, "ARS")}`, monto: 0, montoUsd: null,
    });
  });

  it("ignora los resúmenes sin vencimiento", () => {
    const statements = [
      statement({ id: "icbc-09", issuer: "icbc", dueDate: "2026-09-14" }),
      statement({ id: "icbc-10", issuer: "icbc", closingDate: "2026-10-01", dueDate: null }),
    ];
    const [fuente] = vencimientosDeTarjetas(statements, RANGO);
    expect(resumido(fuente.items)).toEqual([
      { fecha: "2026-10-14", titulo: "ICBC", estado: "estimado", monto: null },
      { fecha: "2026-11-16", titulo: "ICBC", estado: "estimado", monto: null },
      { fecha: "2026-12-14", titulo: "ICBC", estado: "estimado", monto: null },
    ]);
  });

  it("el detalle estimado cuenta los resúmenes del patrón", () => {
    const statements = [
      statement({ id: "visa-08", issuer: "visa_signature", dueDate: "2026-08-13" }),
      statement({ id: "visa-09", issuer: "visa_signature", dueDate: "2026-09-14" }),
      visaOctubre,
    ];
    const [fuente] = vencimientosDeTarjetas(statements, RANGO);
    expect(fuente.items[1].detalle).toBe("Según los últimos 3 resúmenes");
  });

  it("cada emisor es una fuente independiente", () => {
    const fuentes = vencimientosDeTarjetas([visaOctubre, statement({ id: "icbc-09", issuer: "icbc", dueDate: "2026-09-14" })], RANGO);
    expect(fuentes.map(({ etiqueta }) => etiqueta)).toEqual(["ICBC", "Visa Signature"]);
    expect(fuentes[0].items.map(({ fecha }) => fecha)).toEqual(["2026-10-14", "2026-11-16", "2026-12-14"]);
    expect(fuentes[1].items.map(({ fecha }) => fecha)).toEqual(["2026-10-13", "2026-11-13", "2026-12-14"]);
  });

  it("un emisor sin resúmenes de los últimos 3 meses queda desactualizado y sin estimados", () => {
    const [fuente] = vencimientosDeTarjetas([statement({ id: "icbc-05", issuer: "icbc", dueDate: "2026-05-14" })], RANGO);
    expect(fuente).toEqual({ etiqueta: "ICBC", items: [], desactualizada: true });
  });

  it("un vencimiento importado dos veces aparece una sola vez, con el último importado", () => {
    const statements = [
      statement({ id: "visa-b", issuer: "visa_signature", dueDate: "2026-10-13", saldoArs: 2, uploadedAt: "2026-10-03T09:00:00.000Z" }),
      statement({ id: "visa-a", issuer: "visa_signature", dueDate: "2026-10-13", saldoArs: 1, uploadedAt: "2026-10-02T09:00:00.000Z" }),
    ];
    const [fuente] = vencimientosDeTarjetas(statements, RANGO);
    const confirmados = fuente.items.filter(({ estado }) => estado === "confirmado");
    expect(confirmados).toHaveLength(1);
    expect(confirmados[0].monto).toBe(2);
    expect(new Set(fuente.items.map(({ id }) => id)).size).toBe(fuente.items.length);
  });

  it("sin resúmenes no hay fuentes", () => {
    expect(vencimientosDeTarjetas([], RANGO)).toEqual([]);
  });
});

describe("estimarCuotaCredito", () => {
  const ultimo = creditCoupon(24, "2026-09-04");

  it("usa la cuota pura a la UVA de hoy más el resto no-UVA del último cupón", () => {
    expect(estimarCuotaCredito(ultimo, 2_000)).toBe(210_000);
  });

  it("sin UVA de hoy usa la cotización del cupón", () => {
    expect(estimarCuotaCredito(ultimo, null)).toBe(160_000);
  });

  it("nunca estima por debajo de la cotización del cupón", () => {
    expect(estimarCuotaCredito(ultimo, 1_400)).toBe(160_000);
  });
});

describe("vencimientosDeCredito", () => {
  const cupones = [creditCoupon(22, "2026-07-06"), creditCoupon(23, "2026-08-05"), creditCoupon(24, "2026-09-04")];

  it("estima las cuotas siguientes con número correlativo y la UVA de hoy", () => {
    const [fuente] = vencimientosDeCredito(cupones, 240, 2_000, RANGO);
    expect(fuente.etiqueta).toBe("Crédito UVA");
    expect(resumido(fuente.items)).toEqual([
      { fecha: "2026-10-05", titulo: "Crédito UVA · cuota 25", estado: "estimado", monto: 210_000 },
      { fecha: "2026-11-05", titulo: "Crédito UVA · cuota 26", estado: "estimado", monto: 210_000 },
      { fecha: "2026-12-07", titulo: "Crédito UVA · cuota 27", estado: "estimado", monto: 210_000 },
    ]);
    expect(fuente.items[0]).toMatchObject({
      id: "credito-2026-10-05", sentido: "pago", detalle: `${formatUva(100)} a la UVA de hoy`, montoUsd: null,
    });
  });

  it("sin UVA más nueva la estimación repite la última cuota", () => {
    const [fuente] = vencimientosDeCredito(cupones, 240, null, RANGO);
    expect(fuente.items[0]).toMatchObject({ detalle: "Igual a la cuota 24", monto: 160_000 });
  });

  it("un cupón con débito dentro del rango es confirmado", () => {
    const [fuente] = vencimientosDeCredito([...cupones, creditCoupon(25, "2026-10-05")], 240, 2_000, RANGO);
    expect(fuente.items[0]).toMatchObject({
      estado: "confirmado", titulo: "Crédito UVA · cuota 25", detalle: `Cupón importado · ${formatUva(100)}`, monto: 160_000,
    });
    expect(fuente.items[1]).toMatchObject({ estado: "estimado", titulo: "Crédito UVA · cuota 26" });
  });

  it("no proyecta más allá de la última cuota", () => {
    const [fuente] = vencimientosDeCredito(cupones, 26, 2_000, RANGO);
    expect(fuente.items.map(({ titulo }) => titulo)).toEqual(["Crédito UVA · cuota 25", "Crédito UVA · cuota 26"]);
  });

  it("un crédito terminado no proyecta ni avisa, aunque sus cupones sean viejos", () => {
    const viejos = [creditCoupon(22, "2026-03-04"), creditCoupon(23, "2026-04-06"), creditCoupon(24, "2026-05-05")];
    expect(vencimientosDeCredito(viejos, 24, 2_000, RANGO)).toEqual([{ etiqueta: "Crédito UVA", items: [], desactualizada: false }]);
  });

  it("sin cupones de los últimos 3 meses queda desactualizado", () => {
    const viejos = [creditCoupon(22, "2026-03-04"), creditCoupon(23, "2026-04-06"), creditCoupon(24, "2026-05-05")];
    expect(vencimientosDeCredito(viejos, 240, 2_000, RANGO)).toEqual([{ etiqueta: "Crédito UVA", items: [], desactualizada: true }]);
  });

  it("sin cupones no hay fuente", () => {
    expect(vencimientosDeCredito([], null, null, RANGO)).toEqual([]);
  });
});

describe("vencimientosDeAuto", () => {
  const cupones = [autoCoupon(23, "2026-08-10"), autoCoupon(24, "2026-09-09"), autoCoupon(25, "2026-10-09", 260_000)];

  it("un cupón con vencimiento futuro es confirmado y los siguientes repiten su total", () => {
    const [fuente] = vencimientosDeAuto(cupones, 120, RANGO);
    expect(fuente.etiqueta).toBe("Plan del auto");
    expect(resumido(fuente.items)).toEqual([
      { fecha: "2026-10-09", titulo: "Plan del auto · cuota 25", estado: "confirmado", monto: 260_000 },
      { fecha: "2026-11-09", titulo: "Plan del auto · cuota 26", estado: "estimado", monto: 260_000 },
      { fecha: "2026-12-09", titulo: "Plan del auto · cuota 27", estado: "estimado", monto: 260_000 },
    ]);
    expect(fuente.items[0].detalle).toBe("Cupón importado");
    expect(fuente.items[1]).toMatchObject({ id: "auto-2026-11-09", detalle: "Igual a la cuota 25" });
  });

  it("no proyecta más allá de la última cuota del plan", () => {
    const [fuente] = vencimientosDeAuto(cupones, 26, RANGO);
    expect(fuente.items.map(({ titulo }) => titulo)).toEqual(["Plan del auto · cuota 25", "Plan del auto · cuota 26"]);
  });

  it("sin cupones no hay fuente", () => {
    expect(vencimientosDeAuto([], 120, RANGO)).toEqual([]);
  });
});

describe("vencimientosDeSueldo", () => {
  const recibos = [payslip("2026-06", "2026-07-01"), payslip("2026-07", "2026-07-31"), payslip("2026-08", "2026-09-01")];

  it("ancla en el mes siguiente al período y corre el cobro al viernes anterior", () => {
    const [fuente] = vencimientosDeSueldo(recibos, RANGO);
    expect(fuente.etiqueta).toBe("Sueldo");
    expect(fuente.items).toEqual([
      {
        id: "sueldo-2026-10-30", tipo: "sueldo", sentido: "cobro", estado: "estimado", fecha: "2026-10-30",
        titulo: "Sueldo de octubre 2026", detalle: "Igual al neto de agosto 2026", monto: 2_100_000, montoUsd: null,
      },
      {
        id: "sueldo-2026-12-01", tipo: "sueldo", sentido: "cobro", estado: "estimado", fecha: "2026-12-01",
        titulo: "Sueldo de noviembre 2026", detalle: "Igual al neto de agosto 2026", monto: 2_100_000, montoUsd: null,
      },
    ]);
  });

  it("ignora el SAC", () => {
    const conSac = [...recibos, payslip("2026-09", "2026-10-20", { tipo: "sac", neto: 1_000_000 })];
    const [fuente] = vencimientosDeSueldo(conSac, RANGO);
    expect(fuente.items.map(({ fecha }) => fecha)).toEqual(["2026-10-30", "2026-12-01"]);
  });

  it("un recibo con fecha de pago futura es confirmado", () => {
    const [fuente] = vencimientosDeSueldo([payslip("2026-09", "2026-10-05", { neto: 2_200_000 })], RANGO);
    expect(fuente.items[0]).toMatchObject({
      estado: "confirmado", fecha: "2026-10-05", titulo: "Sueldo de septiembre 2026", detalle: "Recibo importado", monto: 2_200_000,
    });
  });

  it("sin recibos mensuales no hay fuente", () => {
    expect(vencimientosDeSueldo([payslip("2026-06", "2026-06-30", { tipo: "sac" })], RANGO)).toEqual([]);
  });
});
