import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import { TopMerchantsChart } from "./TopMerchantsChart.js";
import { InstallmentsByMerchantChart } from "./InstallmentsByMerchantChart.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

const merchants = [
  { merchant: "MERCADOLIBRE SUPERMERCADO", total: 1500, count: 3 },
  { merchant: "UBER", total: 800, count: 2 },
];

const detail = [
  {
    month: "2026-06",
    total: 1500,
    count: 1,
    items: [{ merchant: "MERCADOLIBRE SUPERMERCADO", category: "Compras", amount: 1500, installmentNumber: 3, installmentTotal: 4, purchaseDate: "2026-05-04" }],
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/stats/top-merchants") ? merchants
      : url.includes("/stats/future-installments/detail") ? detail
      : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const chart = async () => probeOf(await screen.findByTestId("nivo-chart"));

describe("barras horizontales de comercios", () => {
  it("en mobile el top de comercios saca el eje de montos y angosta la columna de nombres", async () => {
    emulateMobile();
    renderWithProviders(<TopMerchantsChart currency="ARS" />);
    expect(await chart()).toMatchObject({ axisBottom: "none", margin: { top: 8, right: 24, bottom: 8, left: 96 } });
  });

  it("en compu el top de comercios queda como siempre", async () => {
    emulateDesktop();
    renderWithProviders(<TopMerchantsChart currency="ARS" />);
    expect(await chart()).toMatchObject({ axisBottom: "shown", margin: { top: 8, right: 24, bottom: 32, left: 136 } });
  });

  it("en mobile las cuotas por comercio siguen la misma regla", async () => {
    emulateMobile();
    renderWithProviders(<InstallmentsByMerchantChart currency="ARS" />);
    expect(await chart()).toMatchObject({ axisBottom: "none", margin: { top: 8, right: 24, bottom: 8, left: 96 } });
  });

  it("en compu las cuotas por comercio quedan como siempre", async () => {
    emulateDesktop();
    renderWithProviders(<InstallmentsByMerchantChart currency="ARS" />);
    expect(await chart()).toMatchObject({ axisBottom: "shown", margin: { top: 8, right: 24, bottom: 32, left: 136 } });
  });
});
