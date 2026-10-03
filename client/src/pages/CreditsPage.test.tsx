import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { CreditsPage } from "./CreditsPage.js";

const coupon = (id: string, cuotaNro: number, fechaDebito: string) => ({
  id, prestamoNro: "0405727408", cuotaNro, fechaDebito, capital: 184689.39,
  intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93, cuotaPuraUva: 699.6,
  cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84, tea: 9.27, tna: 8.9, cft: 0,
  tipoCambioUsd: 1350, tipoCambioSource: "api", totalUsd: 813.1,
});

function route(url: string) {
  if (url.includes("/credits/summary")) {
    return { prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240, totalPagado: 13594820.38,
      capitalPagado: 2378973.78, interesPagado: 11097965.12, seguroPagado: 117881.48, capitalOriginalUva: 78316.73,
      capitalAmortizadoUva: 1355.89, capitalPendienteUva: 76960.84, capitalPendientePesos: 153827014.64,
      porcentajeAvanceCapital: 0.017313, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9 };
  }
  if (url.includes("/credits/coupons")) return [coupon("1", 1, "2025-08-18"), coupon("2", 6, "2026-01-19")];
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CreditsPage", () => {
  it("muestra KPIs, gráficos y detalle mes a mes", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    await waitFor(() => expect(screen.getByText("Total pagado")).toBeInTheDocument());
    expect(screen.getByText(/capital vs interés por mes/i)).toBeInTheDocument();
    expect(screen.getByText(/detalle mes a mes/i)).toBeInTheDocument();
    expect(screen.getByText(/valor de la cuota en usd/i)).toBeInTheDocument();
  });

  it("por defecto el detalle muestra solo el año actual y los KPIs siguen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00"));
    renderWithProviders(<CreditsPage />, { route: "/credits" });
    const table = await screen.findByRole("table");
    expect(within(table).getByText("2026-01-19")).toBeInTheDocument();
    expect(within(table).queryByText("2025-08-18")).not.toBeInTheDocument();
    expect(await screen.findByText("Total pagado")).toBeInTheDocument();
  });

  it("con un año sin datos mantiene los KPIs y muestra los gráficos vacíos", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=2019" });
    await waitFor(() => expect(screen.getByText("Total pagado")).toBeInTheDocument());
    expect(screen.getAllByText("Sin datos").length).toBeGreaterThan(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/detalle mes a mes/i)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /año/i })).toHaveTextContent("2019");
  });

  it("ofrece en el filtro de Año los años de los cupones", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    await userEvent.click(await screen.findByRole("combobox", { name: /año/i }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "2025" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "2026" })).toBeInTheDocument();
  });
});

const patches = () => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === "PATCH")
  .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init?.body)) as unknown }));

const openRateSheet = async (cuota: number) => {
  const card = await screen.findByRole("article", { name: `Cuota ${cuota}` });
  await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
  await userEvent.click(within(card).getByRole("button", { name: `editar TC cuota ${cuota}` }));
  return screen.getByRole("dialog", { name: `TC cuota ${cuota}` });
};

describe("CreditsPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra el detalle mes a mes como tarjetas, sin tabla", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    expect(await screen.findByRole("article", { name: "Cuota 1" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Cuota 6" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("cambiar el TC desde la hoja manda el PATCH del cupón", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    const sheet = await openRateSheet(6);
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    expect(input).toHaveValue("1350");
    await userEvent.clear(input);
    await userEvent.type(input, "1415,5");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(patches()).toEqual([{ url: "/api/credits/coupons/2", body: { tipoCambioUsd: 1415.5 } }]));
  });

  it("un TC igual al actual o de 0 no manda nada", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    const sheet = await openRateSheet(6);
    const save = within(sheet).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    fireEvent.click(save);
    expect(patches()).toEqual([]);
  });
});
