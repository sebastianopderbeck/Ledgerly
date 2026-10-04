import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NetWorthMonthDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { probeOf } from "../testing/nivoProbe.js";
import { seriesColor } from "./charts/palette.js";
import { NetWorthEvolutionCard } from "./NetWorthEvolutionCard.js";

vi.mock("@nivo/line", async () => ({ ResponsiveLine: (await import("../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const month = (index: number): NetWorthMonthDTO => ({
  periodo: periodo(index),
  activosArs: 17_500_000, pasivosArs: 10_068_000, netoArs: 7_432_000 + index,
  activosUsd: 17_500, pasivosUsd: 10_068, netoUsd: 7_432 + index,
});

const months = (count: number): NetWorthMonthDTO[] => Array.from({ length: count }, (_unused, index) => month(index));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

const shown = (text: string): string => text.replace(/\s/g, " ");

describe("NetWorthEvolutionCard", () => {
  it("arranca en dólares y cambia a pesos", async () => {
    renderWithProviders(<NetWorthEvolutionCard months={months(3)} />);
    expect(screen.getByText("Evolución del patrimonio")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "moneda del gráfico" })).toBeInTheDocument();
    const usd = screen.getByRole("button", { name: "USD" });
    const pesos = screen.getByRole("button", { name: "Pesos" });
    expect(usd).toHaveAttribute("aria-pressed", "true");
    const legend = screen.getByRole("list", { name: "referencias" });
    expect(within(legend).getByText(shown(formatMoney(7_434, "USD")))).toBeInTheDocument();
    await userEvent.click(pesos);
    expect(pesos).toHaveAttribute("aria-pressed", "true");
    expect(within(legend).getByText(shown(formatMoney(7_432_002, "ARS")))).toBeInTheDocument();
  });

  it("pinta activos, pasivos y neto con su color de la paleta y tooltip por mes", () => {
    renderWithProviders(<NetWorthEvolutionCard months={months(3)} />);
    expect(chart().colors).toEqual([2, 5, 1].map((slot) => seriesColor("dark", slot)));
    expect(chart()).toMatchObject({ enableSlices: "x", customTooltip: "yes" });
    const legend = screen.getByRole("list", { name: "referencias" });
    expect(within(legend).getByText("Activos")).toBeInTheDocument();
    expect(within(legend).getByText("Pasivos")).toBeInTheDocument();
    expect(within(legend).getByText("Patrimonio neto")).toBeInTheDocument();
  });

  it("en mobile muestra a lo sumo 6 meses en el eje y siempre el último", () => {
    emulateMobile();
    renderWithProviders(<NetWorthEvolutionCard months={months(14)} />);
    const { tickValues, margin } = chart();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
    expect(margin).toEqual({ top: 16, right: 24, bottom: 56, left: 56 });
  });

  it("sin meses muestra Sin datos", () => {
    renderWithProviders(<NetWorthEvolutionCard months={[]} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByTestId("nivo-chart")).not.toBeInTheDocument();
  });
});
