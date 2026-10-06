import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { cssFor } from "../testing/cssFor.js";
import { formatMoney } from "../format.js";
import { CashFlowTable } from "./CashFlowTable.js";
import { CashFlowCards } from "./CashFlowCards.js";

afterEach(() => {
  cleanup();
});

const money = (value: number): string => formatMoney(value, "ARS").replace(/\s/g, " ");

const completo: CashFlowMonthDTO = {
  mes: "2026-08",
  estado: "completo",
  ingreso: 1_000_000,
  conSac: false,
  tarjetas: 500_000,
  hipoteca: 300_000,
  auto: 100_000,
  egresos: 900_000,
  margen: 100_000,
  tasaAhorro: 0.1,
  faltantes: [],
  estimados: [],
};

const incompleto: CashFlowMonthDTO = {
  ...completo, mes: "2026-09", estado: "incompleto", margen: null, tasaAhorro: null, faltantes: ["Resumen ICBC"],
};

const negativo: CashFlowMonthDTO = {
  ...completo, mes: "2026-10", estado: "en_curso", egresos: 1_200_000, margen: -200_000, tasaAhorro: -0.2,
  estimados: ["Sueldo (último neto)"],
};

const conSac: CashFlowMonthDTO = {
  ...completo, mes: "2026-12", estado: "proyectado", ingreso: 1_500_000, conSac: true, margen: 600_000, tasaAhorro: 0.4,
  estimados: ["Sueldo (último neto)", "SAC (½ del último neto)"],
};

const meses = [conSac, negativo, incompleto, completo];

describe("CashFlowTable", () => {
  it("muestra una fila por mes con su estado, montos y notas", () => {
    renderWithProviders(<CashFlowTable meses={meses} />);
    const table = screen.getByRole("table", { name: "Detalle del flujo de caja" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    const septiembre = within(table).getByRole("row", { name: /Septiembre de 2026/ });
    expect(within(septiembre).getByText("Incompleto")).toBeInTheDocument();
    expect(within(septiembre).getAllByText("—")).toHaveLength(2);
    expect(within(septiembre).getByText("Falta: Resumen ICBC")).toBeInTheDocument();
    const agosto = within(table).getByRole("row", { name: /Agosto de 2026/ });
    expect(within(agosto).getByText("Completo")).toBeInTheDocument();
    expect(within(agosto).getByText("10,0%")).toBeInTheDocument();
  });

  it("pinta el margen negativo en rojo y marca el SAC", () => {
    renderWithProviders(<CashFlowTable meses={meses} />);
    const octubre = screen.getByRole("row", { name: /Octubre de 2026/ });
    expect(cssFor(within(octubre).getByText(money(-200_000)))).toMatch(/color:#(f87171|dc2626)/);
    const diciembre = screen.getByRole("row", { name: /Diciembre de 2026/ });
    expect(within(diciembre).getByText("SAC")).toBeInTheDocument();
    expect(within(diciembre).getByText("Proyectado")).toBeInTheDocument();
  });

  it("sin meses no muestra la tabla", () => {
    renderWithProviders(<CashFlowTable meses={[]} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("CashFlowCards", () => {
  it("muestra una tarjeta por mes con el margen y el ahorro", () => {
    renderWithProviders(<CashFlowCards meses={meses} />);
    expect(screen.getAllByRole("article")).toHaveLength(4);
    const septiembre = screen.getByRole("article", { name: "Septiembre de 2026" });
    expect(within(septiembre).getByText("Incompleto")).toBeInTheDocument();
    expect(within(septiembre).getByText("Margen")).toBeInTheDocument();
    expect(within(septiembre).getByText("Ahorro")).toBeInTheDocument();
    expect(within(septiembre).getAllByText("—")).toHaveLength(2);
  });

  it("en el detalle muestra los montos y las notas", async () => {
    renderWithProviders(<CashFlowCards meses={meses} />);
    const septiembre = screen.getByRole("article", { name: "Septiembre de 2026" });
    await userEvent.click(within(septiembre).getByRole("button", { name: "Ver detalle" }));
    expect(within(septiembre).getByText("Tarjetas")).toBeInTheDocument();
    expect(within(septiembre).getByText("Falta")).toBeInTheDocument();
    expect(within(septiembre).getByText("Resumen ICBC")).toBeInTheDocument();

    const diciembre = screen.getByRole("article", { name: "Diciembre de 2026" });
    await userEvent.click(within(diciembre).getByRole("button", { name: "Ver detalle" }));
    expect(within(diciembre).getByText(`${money(1_500_000)} · con SAC`)).toBeInTheDocument();
    expect(within(diciembre).getByText("Estimado")).toBeInTheDocument();
    expect(within(diciembre).getByText("Sueldo (último neto), SAC (½ del último neto)")).toBeInTheDocument();
  });

  it("pinta el margen negativo en rojo", () => {
    renderWithProviders(<CashFlowCards meses={meses} />);
    const octubre = screen.getByRole("article", { name: "Octubre de 2026" });
    expect(cssFor(within(octubre).getByText(money(-200_000)))).toMatch(/color:#(f87171|dc2626)/);
  });
});
