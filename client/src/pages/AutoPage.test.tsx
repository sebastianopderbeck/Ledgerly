import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flushAsync } from "../testing/flushAsync.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { AutoPage } from "./AutoPage.js";

const coupon = (id: string, cuotaNro: number, fechaVencimiento: string) => ({
  id, grupo: "3684", orden: "97", cuotaNro, plan: "K", fechaEmision: fechaVencimiento,
  fechaVencimiento, comprobante: `00006275706${cuotaNro}`, modelo: "C3 AIRCROSS T200 FEEL PK MY24",
  valorMovil: 28240000.01, conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }],
  totalAPagar: 268551.23, tipoCambioUsd: 1000, tipoCambioSource: "api", totalUsd: 268.55,
});

function route(url: string) {
  if (url.includes("/auto/summary")) {
    return { grupo: "3684", orden: "97", plan: "K", modelo: "C3 AIRCROSS T200 FEEL PK MY24",
      cuotasPagadas: 4, cuotasTotales: 120, porcentajeAvance: 0.0333, totalPagado: 1428724.71,
      valorActualAuto: 41580000, totalPagadoUsd: 1200, ultimaCuota: 22, fechaUltimoVencimiento: "2026-07-10" };
  }
  if (url.includes("/auto/coupons")) return [coupon("1", 2, "2024-11-11"), coupon("2", 17, "2026-02-10")];
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

describe("AutoPage", () => {
  it("muestra el título, KPIs y el detalle mes a mes", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto?year=all" });
    await waitFor(() => expect(screen.getByText("Total pagado")).toBeInTheDocument());
    expect(screen.getByText("Valor del auto")).toBeInTheDocument();
    expect(screen.getByText("Avance")).toBeInTheDocument();
    expect(screen.getByText("Detalle mes a mes")).toBeInTheDocument();
    expect(screen.getByText("Composición de la cuota por mes")).toBeInTheDocument();
    expect(screen.getByText("Total pagado por mes")).toBeInTheDocument();
    expect(screen.getByText("Evolución del valor del auto")).toBeInTheDocument();
    expect(screen.getByText("Avance del plan")).toBeInTheDocument();
    expect(screen.getByText("Valor de la cuota en USD")).toBeInTheDocument();
  });

  it("por defecto el detalle muestra solo el año actual y los KPIs siguen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00"));
    renderWithProviders(<AutoPage />, { route: "/auto" });
    const table = await screen.findByRole("table");
    expect(within(table).getByText("2026-02-10")).toBeInTheDocument();
    expect(within(table).queryByText("2024-11-11")).not.toBeInTheDocument();
    expect(await screen.findByText("Valor del auto")).toBeInTheDocument();
  });

  it("con un año sin datos no muestra el detalle vacío", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto?year=2019" });
    await waitFor(() => expect(screen.getByText("Valor del auto")).toBeInTheDocument());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Detalle mes a mes")).not.toBeInTheDocument();
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

describe("AutoPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra el detalle mes a mes como tarjetas, con los conceptos en el detalle y sin tabla", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto?year=all" });
    const card = await screen.findByRole("article", { name: "Cuota 17" });
    expect(within(card).getByText("vence 2026-02-10")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
    expect(within(card).getByText("ANTICIPO ALICUOTA (AL)")).toBeInTheDocument();
    expect(within(card).getByText("Valor auto")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Cuota 2" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("cambiar el TC desde la hoja manda el PATCH del cupón del auto", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto?year=all" });
    const sheet = await openRateSheet(17);
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    expect(input).toHaveValue("1000");
    await userEvent.clear(input);
    await userEvent.type(input, "1100");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(patches()).toEqual([{ url: "/api/auto/coupons/2", body: { tipoCambioUsd: 1100 } }]));
  });

  it("un TC igual al actual o negativo no manda nada", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto?year=all" });
    const sheet = await openRateSheet(17);
    const save = within(sheet).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    await userEvent.clear(input);
    await userEvent.type(input, "-5");
    expect(save).toBeDisabled();
    fireEvent.click(save);
    await flushAsync();
    expect(patches()).toEqual([]);
  });
});
