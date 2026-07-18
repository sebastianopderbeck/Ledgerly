import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { AutoCouponsTable } from "./AutoCouponsTable.js";

const coupon = {
  id: "c1", grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
  fechaEmision: "2024-10-18", fechaVencimiento: "2024-11-11", comprobante: "000062757060",
  modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01,
  conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }, { label: "SEGURO DE VIDA (SV)", amount: 23389.67 }],
  totalAPagar: 268551.23, tipoCambioUsd: 1000, tipoCambioSource: "api", totalUsd: 268.55,
};
const patchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      patchSpy(url, init.body);
      return new Response(JSON.stringify({ ...coupon, tipoCambioUsd: 1100, tipoCambioSource: "manual", totalUsd: 244.14 }), { status: 200 });
    }
    return new Response(JSON.stringify([coupon]), { status: 200 });
  }));
});
afterEach(() => { vi.restoreAllMocks(); patchSpy.mockReset(); });

describe("AutoCouponsTable", () => {
  it("muestra columnas de conceptos y Pagado (USD)", async () => {
    renderWithProviders(<AutoCouponsTable />);
    await waitFor(() => expect(screen.getByText("Pagado (USD)")).toBeInTheDocument());
    expect(screen.getByText("ANTICIPO ALICUOTA (AL)")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /tc oficial/i })).toBeInTheDocument();
  });

  it("editar el TC dispara un PATCH a /auto/coupons", async () => {
    renderWithProviders(<AutoCouponsTable />);
    await waitFor(() => expect(screen.getByText("Pagado (USD)")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /editar tc cuota 2/i }));
    const input = screen.getByRole("spinbutton", { name: /tc cuota 2/i });
    await userEvent.clear(input);
    await userEvent.type(input, "1100{Enter}");
    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
    expect(patchSpy.mock.calls[0][0]).toContain("/auto/coupons/c1");
  });
});
