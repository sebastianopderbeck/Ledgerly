import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import type { MerchantSaving } from "../../installmentSavings.js";
import { seriesColor } from "./palette.js";
import { InstallmentSavingsByMerchantChart, savingsLegendItems } from "./InstallmentSavingsByMerchantChart.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

const merchants: MerchantSaving[] = [
  { merchant: "MERCADOLIBRE SUPERMERCADO", paidSaving: 120, futureSaving: 40, saving: 160, purchaseCount: 2 },
  { merchant: "FRAVEGA", paidSaving: 50, futureSaving: 0, saving: 50, purchaseCount: 1 },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

describe("InstallmentSavingsByMerchantChart", () => {
  it("en mobile saca el eje de montos, angosta la columna de nombres y usa el tooltip compacto", () => {
    emulateMobile();
    renderWithProviders(<InstallmentSavingsByMerchantChart merchants={merchants} />);
    expect(chart()).toMatchObject({ axisBottom: "none", customTooltip: "yes", margin: { top: 8, right: 24, bottom: 8, left: 96 } });
  });

  it("en compu muestra el eje de montos con la columna de nombres ancha", () => {
    emulateDesktop();
    renderWithProviders(<InstallmentSavingsByMerchantChart merchants={merchants} />);
    expect(chart()).toMatchObject({ axisBottom: "shown", customTooltip: "no", margin: { top: 8, right: 24, bottom: 32, left: 136 } });
  });

  it("pinta pagadas y a vencer con las ranuras 2 y 3 de la paleta, igual que la leyenda", () => {
    renderWithProviders(<InstallmentSavingsByMerchantChart merchants={merchants} />);
    expect(chart().colors).toEqual([seriesColor("dark", 2), seriesColor("dark", 3)]);
    expect(savingsLegendItems("dark")).toEqual([
      { id: "paid", label: "Pagadas", color: seriesColor("dark", 2) },
      { id: "future", label: "A vencer", color: seriesColor("dark", 3) },
    ]);
  });

  it("sin comercios dice que no hay ahorro para mostrar", () => {
    renderWithProviders(<InstallmentSavingsByMerchantChart merchants={[]} />);
    expect(screen.getByText("Sin ahorro para mostrar")).toBeInTheDocument();
    expect(screen.queryByTestId("nivo-chart")).not.toBeInTheDocument();
  });
});
