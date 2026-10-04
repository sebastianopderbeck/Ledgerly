import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { vencimiento } from "../testing/vencimientosFixtures.js";
import { agruparVencimientos, resumenDeGrupo, type Vencimiento } from "../vencimientos.js";
import { VencimientosList } from "./VencimientosList.js";

const HOY = "2026-10-03";

const visible = (texto: string): string => texto.replace(/\s/g, " ");

const items: Vencimiento[] = [
  vencimiento({ fecha: "2026-10-03", titulo: "ICBC", estado: "estimado", monto: null, detalle: "Según el último resumen" }),
  vencimiento({ fecha: "2026-10-04", titulo: "Sueldo de septiembre 2026", tipo: "sueldo", sentido: "cobro", monto: 2_100_000 }),
  vencimiento({
    fecha: "2026-10-05", titulo: "Crédito UVA · cuota 25", tipo: "credito", estado: "estimado", monto: 210_000, detalle: "100,00 UVA a la UVA de hoy",
  }),
  vencimiento({ fecha: "2026-10-06", titulo: "Visa Signature", monto: 812_000, montoUsd: 35, detalle: "Resumen con cierre 02/10" }),
];

const renderList = () => {
  const grupos = agruparVencimientos(items, "semana", HOY);
  renderWithProviders(<VencimientosList grupos={grupos} hoy={HOY} />);
  return grupos;
};

afterEach(() => {
  cleanup();
});

describe("VencimientosList", () => {
  it("muestra un encabezado h2 por grupo con su resumen", () => {
    const grupos = renderList();
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(titulos).toEqual(["Esta semana", "La semana que viene"]);
    const semanaQueViene = screen.getByRole("region", { name: "La semana que viene" });
    expect(within(semanaQueViene).getByText(visible(resumenDeGrupo(grupos[1])))).toBeInTheDocument();
  });

  it("cada fila se nombra con título, fecha y estado", () => {
    renderList();
    expect(screen.getByRole("listitem", { name: "ICBC, 3 de octubre, estimado" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Visa Signature, 6 de octubre, confirmado" })).toBeInTheDocument();
  });

  it("un estimado lleva chip Estimado y ≈ en el monto", () => {
    renderList();
    const fila = screen.getByRole("listitem", { name: "Crédito UVA · cuota 25, 5 de octubre, estimado" });
    expect(within(fila).getByText("Estimado")).toBeInTheDocument();
    expect(within(fila).getByText(visible(`≈ ${formatMoney(210_000, "ARS")}`))).toBeInTheDocument();
    expect(within(fila).getByText("100,00 UVA a la UVA de hoy")).toBeInTheDocument();
  });

  it("un confirmado lleva chip Confirmado y el saldo en dólares", () => {
    renderList();
    const fila = screen.getByRole("listitem", { name: "Visa Signature, 6 de octubre, confirmado" });
    expect(within(fila).getByText("Confirmado")).toBeInTheDocument();
    expect(within(fila).getByText(visible(formatMoney(812_000, "ARS")))).toBeInTheDocument();
    expect(within(fila).getByText(visible(`+ ${formatMoney(35, "USD")}`))).toBeInTheDocument();
  });

  it("una tarjeta estimada dice A confirmar y un cobro lleva +", () => {
    renderList();
    expect(within(screen.getByRole("listitem", { name: "ICBC, 3 de octubre, estimado" })).getByText("A confirmar")).toBeInTheDocument();
    const sueldo = screen.getByRole("listitem", { name: "Sueldo de septiembre 2026, 4 de octubre, confirmado" });
    expect(within(sueldo).getByText(visible(`+${formatMoney(2_100_000, "ARS")}`))).toBeInTheDocument();
  });

  it("un resumen con fecha estimada muestra Estimado y su saldo sin ≈", () => {
    const visa = vencimiento({ fecha: "2026-10-06", titulo: "Visa Signature", estado: "estimado", montoAproximado: false, monto: 812_000 });
    renderWithProviders(<VencimientosList grupos={agruparVencimientos([visa], "semana", HOY)} hoy={HOY} />);
    const fila = screen.getByRole("listitem", { name: "Visa Signature, 6 de octubre, estimado" });
    expect(within(fila).getByText("Estimado")).toBeInTheDocument();
    expect(within(fila).getByText(visible(formatMoney(812_000, "ARS")))).toBeInTheDocument();
  });

  it("la ficha de fecha dice hoy, mañana o el día corto", () => {
    renderList();
    expect(within(screen.getByRole("listitem", { name: /^ICBC/ })).getByText("hoy")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: /^Sueldo/ })).getByText("mañana")).toBeInTheDocument();
    const credito = screen.getByRole("listitem", { name: /^Crédito/ });
    expect(within(credito).getByText("5")).toBeInTheDocument();
    expect(within(credito).getByText("lun")).toBeInTheDocument();
  });
});
