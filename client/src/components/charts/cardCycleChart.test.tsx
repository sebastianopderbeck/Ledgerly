import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import type { CardCycleEntry } from "../../cardCycle.js";
import { CardCycleChart } from "./CardCycleChart.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cards: CardCycleEntry[] = [
  {
    issuer: "visa_signature",
    cardLabel: "Visa Signature",
    last4: "1234",
    saldoActualArs: 2_200_000,
    saldoActualUsd: 0,
    pagoMinimoArs: 220_000,
    closingDate: "2026-09-25",
    dueDate: "2026-10-06",
  },
  {
    issuer: "icbc",
    cardLabel: "ICBC Mastercard",
    last4: "5678",
    saldoActualArs: 4_100_000,
    saldoActualUsd: 0,
    pagoMinimoArs: 410_000,
    closingDate: "2026-09-28",
    dueDate: "2026-10-08",
  },
];

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

describe("A pagar al cierre", () => {
  it("en mobile pide pocas marcas en el eje de montos", () => {
    emulateMobile();
    renderWithProviders(<CardCycleChart cards={cards} />);
    expect(chart().tickValues).toBe(4);
  });

  it("en compu deja que nivo elija las marcas como siempre", () => {
    emulateDesktop();
    renderWithProviders(<CardCycleChart cards={cards} />);
    expect(chart().tickValues).toBeNull();
    expect(chart().margin).toEqual({ top: 8, right: 16, bottom: 40, left: 16 });
  });
});
