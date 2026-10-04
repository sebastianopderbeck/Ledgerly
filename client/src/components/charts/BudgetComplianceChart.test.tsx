import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import type { BudgetMonthSummary } from "../../budgets.js";
import { BudgetComplianceChart, BudgetComplianceTooltip, countTicks } from "./BudgetComplianceChart.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const history = (months: number): BudgetMonthSummary[] =>
  Array.from({ length: months }, (_unused, index) => ({
    month: periodo(index),
    ok: ["Ropa"],
    cerca: ["Transporte"],
    pasado: index % 2 === 0 ? ["Comida"] : [],
  }));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

const legendList = () => screen.getByRole("list", { name: "referencias" });

const cssColor = (color: string) => {
  const element = document.createElement("span");
  element.style.backgroundColor = color;
  return element.style.backgroundColor;
};

describe("BudgetComplianceChart", () => {
  it("sin historial dice Sin datos", () => {
    emulateDesktop();
    renderWithProviders(<BudgetComplianceChart history={[]} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByTestId("nivo-chart")).not.toBeInTheDocument();
  });

  it("usa un tooltip propio", () => {
    emulateDesktop();
    renderWithProviders(<BudgetComplianceChart history={history(3)} />);
    expect(chart().customTooltip).toBe("yes");
  });

  it("la leyenda nombra los tres estados con los mismos colores que las barras", () => {
    emulateDesktop();
    renderWithProviders(<BudgetComplianceChart history={history(3)} />);
    const items = within(legendList()).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["En rango", "Cerca", "Pasado"]);
    const swatches = within(legendList()).getAllByTestId("legend-swatch").map((swatch) => swatch.style.backgroundColor);
    expect((chart().colors ?? []).map((color) => cssColor(String(color)))).toEqual(swatches);
  });

  it("en mobile muestra a lo sumo 6 meses en el eje y siempre el último", () => {
    emulateMobile();
    renderWithProviders(<BudgetComplianceChart history={history(14)} />);
    const { tickValues } = chart();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
    expect(legendList()).toBeInTheDocument();
  });

  it("en compu deja que nivo elija los meses", () => {
    emulateDesktop();
    renderWithProviders(<BudgetComplianceChart history={history(14)} />);
    expect(chart()).toMatchObject({ tickValues: null, margin: { top: 16, right: 24, bottom: 64, left: 40 } });
  });
});

describe("BudgetComplianceTooltip", () => {
  it("titula con el mes y lista las categorías de ese estado", () => {
    renderWithProviders(
      <BudgetComplianceTooltip
        id="pasado"
        color="#dc2626"
        data={{ month: "2026-09", ok: 1, cerca: 0, pasado: 2, okLista: "Ropa", cercaLista: "", pasadoLista: "Comida, Salidas" }}
      />,
    );
    expect(screen.getByText("Septiembre de 2026")).toBeInTheDocument();
    expect(screen.getByText("Pasado:")).toBeInTheDocument();
    expect(screen.getByText("Comida, Salidas")).toBeInTheDocument();
  });
});

describe("countTicks", () => {
  it("marca solo enteros, a lo sumo seis", () => {
    expect(countTicks(0)).toEqual([0]);
    expect(countTicks(3)).toEqual([0, 1, 2, 3]);
    expect(countTicks(5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(countTicks(12)).toEqual([0, 3, 6, 9, 12]);
  });
});
