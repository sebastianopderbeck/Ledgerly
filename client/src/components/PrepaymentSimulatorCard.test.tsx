import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreditSummaryDTO, MacroMonth, MacroSeriesDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { cssFor } from "../testing/cssFor.js";
import { flushAsync } from "../testing/flushAsync.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { PrepaymentSimulatorCard } from "./PrepaymentSimulatorCard.js";

const SALDO = 100000;
const TASA = 0.0075;
const CUOTA = (SALDO * TASA) / (1 - 1.0075 ** -240);

const CREDITO: CreditSummaryDTO = {
  prestamoNro: "0000000001", cuotasPagadas: 10, cuotasTotales: 250,
  totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
  capitalOriginalUva: 110000, capitalAmortizadoUva: 10000, capitalPendienteUva: SALDO, capitalPendientePesos: SALDO * 1900,
  porcentajeAvanceCapital: 0.09, cotizacionUvaActual: 1900, cuotaPuraUva: CUOTA, tna: 9, tasaRealMensual: TASA,
};

const MESES_CON_INFLACION: MacroMonth[] = [
  { periodo: "2026-08", usdOficial: null, uva: 1990, tasa30: null, inflacion: 2 },
];

const macro = (uva: number | null, meses: MacroMonth[]): MacroSeriesDTO => ({
  desde: "2025-01",
  meses,
  hoy: { fecha: "2026-10-02", usdOficial: null, uva, tasa30: null },
});

interface ApiStub {
  summary?: boolean;
  uvaHoy?: number | null;
  meses?: MacroMonth[];
  macroFalla?: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubApi = ({ summary = true, uvaHoy = 2000, meses = [], macroFalla = false }: ApiStub = {}) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/credits/summary")) return summary ? json(CREDITO) : new Response(null, { status: 204 });
    if (url.includes("/macro/series")) return macroFalla ? json({ error: "sin red" }, 500) : json(macro(uvaHoy, meses));
    return json({});
  }));
};

const renderCard = (route = "/credits") => renderWithProviders(<PrepaymentSimulatorCard />, { route });

const findCard = () => screen.findByRole("region", { name: "Simulador de precancelación" });

const montoInput = () => screen.getByRole("textbox", { name: "Monto a adelantar" });

const tile = (name: string) => screen.getByRole("group", { name });

const comoSeLee = (texto: string) => texto.replace(/\s+/g, " ");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PrepaymentSimulatorCard", () => {
  beforeEach(() => stubApi());

  it("sin monto muestra la guía, el saldo de referencia y el aviso de comisión", async () => {
    renderCard();
    const card = await findCard();
    expect(within(card).getByText("Ingresá un monto para ver cuánto te ahorrás.")).toBeInTheDocument();
    expect(within(card).getByText("En pesos. Se convierte a UVA con la cotización de hoy.")).toBeInTheDocument();
    expect(within(card).getByText(/después de la cuota 10\./)).toBeInTheDocument();
    expect(within(card).getByText(/Hasta la cuota 63 el banco puede cobrar comisión/)).toBeInTheDocument();
    expect(montoInput()).toHaveAttribute("inputmode", "decimal");
  });

  it("con un monto en reducir plazo muestra las cuotas menos y el interés ahorrado", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "20.000.000");
    expect(within(tile("Cuotas menos")).getByText("54")).toBeInTheDocument();
    expect(within(tile("Intereses que te ahorrás")).getByText("38.895,86 UVA")).toBeInTheDocument();
    expect(within(tile("Capital que cancelás")).getByText("10.000,00 UVA")).toBeInTheDocument();
    expect(screen.getByText(comoSeLee(`10.000,00 UVA a ${formatMoney(2000, "ARS")} por UVA`))).toBeInTheDocument();
    expect(screen.queryByText("Ingresá un monto para ver cuánto te ahorrás.")).not.toBeInTheDocument();
  });

  it("reducir cuota muestra la cuota nueva sin perder el monto", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "20.000.000");
    await userEvent.click(screen.getByRole("button", { name: "Reducir cuota" }));
    expect(within(tile("Cuota nueva")).getByText("809,75 UVA")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Cuotas menos" })).not.toBeInTheDocument();
    expect(montoInput()).toHaveValue("20.000.000");
  });

  it("tocar la opción elegida no la apaga", async () => {
    renderCard();
    await findCard();
    const plazo = screen.getByRole("button", { name: "Reducir plazo" });
    expect(plazo).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(plazo);
    expect(plazo).toHaveAttribute("aria-pressed", "true");
  });

  it("un monto mayor al saldo cancela todo el crédito", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "300.000.000");
    expect(screen.getByText(/Con este monto cancelás todo el crédito/)).toBeInTheDocument();
    expect(within(tile("Cuotas menos")).getByText("240")).toBeInTheDocument();
    expect(within(tile("Cuotas menos")).getByText("Cancelás el crédito completo")).toBeInTheDocument();
  });

  it("un texto que no es un monto marca el campo en error", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "abc");
    expect(montoInput()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Ingresá un monto mayor a cero, por ejemplo 5.000.000.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá un monto para ver cuánto te ahorrás.")).toBeInTheDocument();
  });

  it("un monto a medio tipear no marca error y sigue mostrando el resultado", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "20.000.0");
    expect(montoInput()).toHaveAttribute("aria-invalid", "false");
    expect(tile("Cuotas menos")).toBeInTheDocument();
  });

  it("sin meses macro muestra el retorno de adelantar sin compararlo", async () => {
    renderCard();
    const card = await findCard();
    expect(within(card).getByText(/^Adelantar capital rinde \+9,4% real anual/)).toBeInTheDocument();
    expect(within(card).queryByText("Ranking con los supuestos por defecto de Contexto.")).not.toBeInTheDocument();
  });

  it("el link Ver Contexto conserva el año elegido", async () => {
    renderCard("/credits?year=2026");
    const card = await findCard();
    expect(within(card).getByRole("link", { name: "Ver Contexto" })).toHaveAttribute("href", "/contexto?year=2026");
  });
});

describe("PrepaymentSimulatorCard con el veredicto de Contexto", () => {
  it("con adelantar primero lo dice y aclara los supuestos", async () => {
    stubApi({ meses: MESES_CON_INFLACION });
    renderCard();
    const card = await findCard();
    expect(within(card).getByText(/^Según Contexto, hoy adelantar capital es la opción que más rinde/)).toBeInTheDocument();
    expect(within(card).getByText("Ranking con los supuestos por defecto de Contexto.")).toBeInTheDocument();
  });
});

describe("PrepaymentSimulatorCard sin la UVA de hoy", () => {
  it("con hoy.uva en null usa la cotización del último cupón y lo aclara", async () => {
    stubApi({ uvaHoy: null });
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "19.000.000");
    expect(screen.getByText(comoSeLee(`10.000,00 UVA a ${formatMoney(1900, "ARS")} por UVA (cotización del último cupón)`))).toBeInTheDocument();
  });

  it("si /macro/series falla la tarjeta igual se muestra con el último cupón", async () => {
    stubApi({ macroFalla: true });
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "19.000.000");
    expect(screen.getByText(/\(cotización del último cupón\)$/)).toBeInTheDocument();
  });
});

describe("PrepaymentSimulatorCard sin crédito", () => {
  it("con summary 204 no se monta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubApi({ summary: false });
    renderCard();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/credits/summary"))).toBe(true));
    await flushAsync();
    await flushAsync();
    expect(screen.queryByRole("region", { name: "Simulador de precancelación" })).not.toBeInTheDocument();
  });
});

describe("PrepaymentSimulatorCard en mobile", () => {
  beforeEach(() => {
    stubApi();
    emulateMobile();
  });

  it("los botones de modo y Ver Contexto tienen objetivos táctiles de 44px", async () => {
    renderCard();
    const card = await findCard();
    for (const name of ["Reducir plazo", "Reducir cuota"]) {
      expect(cssFor(within(card).getByRole("button", { name }))).toContain("min-height:44px");
    }
    expect(cssFor(within(card).getByRole("link", { name: "Ver Contexto" }))).toContain("min-height:44px");
  });

  it("calcula igual que en compu", async () => {
    renderCard();
    await findCard();
    await userEvent.type(montoInput(), "20.000.000");
    expect(within(tile("Cuotas menos")).getByText("54")).toBeInTheDocument();
  });
});
