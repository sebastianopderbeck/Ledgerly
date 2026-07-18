import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { MortgageCouponsTable } from "./MortgageCouponsTable.js";

const coupon = {
  id: "c1", prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18", capital: 184689.39,
  intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93, cuotaPuraUva: 699.6,
  cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84, tea: 9.27, tna: 8.9, cft: 0,
  tipoCambioUsd: 1350, tipoCambioSource: "api", totalUsd: 813.1,
};
const patchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") { patchSpy(url, init.body); return new Response(JSON.stringify({ ...coupon, tipoCambioUsd: 1400, tipoCambioSource: "manual", totalUsd: 784.06 }), { status: 200 }); }
    return new Response(JSON.stringify([coupon]), { status: 200 });
  }));
});
afterEach(() => { vi.restoreAllMocks(); patchSpy.mockReset(); });

describe("MortgageCouponsTable", () => {
  it("muestra columna Pagado (USD)", async () => {
    renderWithProviders(<MortgageCouponsTable />);
    await waitFor(() => expect(screen.getByText(/pagado \(usd\)/i)).toBeInTheDocument());
    expect(screen.getByRole("columnheader", { name: /tc oficial/i })).toBeInTheDocument();
  });

  it("editar el TC dispara un PATCH", async () => {
    renderWithProviders(<MortgageCouponsTable />);
    await waitFor(() => expect(screen.getByText(/pagado \(usd\)/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /editar tc cuota 1/i }));
    const input = screen.getByRole("spinbutton", { name: /tc cuota 1/i });
    await userEvent.clear(input);
    await userEvent.type(input, "1400{Enter}");
    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
    expect(patchSpy.mock.calls[0][0]).toContain("/credits/coupons/c1");
  });
});
