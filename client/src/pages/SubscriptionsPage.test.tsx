import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Currency, SubscriptionDTO, SubscriptionsReportDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { SubscriptionsPage } from "./SubscriptionsPage.js";

const streamflix: SubscriptionDTO = {
  key: "STREAMFLIX COM", nombre: "STREAMFLIX.COM", busqueda: "STREAMFLIX", categoria: "Suscripciones",
  cardLabel: "Visa Signature", moneda: "USD", montoActual: 12.99, montoMensualArs: 19030.35,
  primerCobro: "2026-01-09", ultimoCobro: "2026-08-09", proximoCobro: "2026-09-09", cobros: 8,
  estado: "activa", oculta: false, aumento: null, monedaAnterior: "ARS",
};

const musicapp: SubscriptionDTO = {
  ...streamflix, key: "MUSICAPP", nombre: "MUSICAPP", busqueda: "MUSICAPP", cardLabel: "ICBC", moneda: "ARS",
  montoActual: 5490, montoMensualArs: 5490, primerCobro: "2026-03-12", ultimoCobro: "2026-08-12",
  proximoCobro: "2026-09-12", cobros: 6, aumento: { variacion: 0.1002, desde: "2026-03", montoAnterior: 4990 },
  monedaAnterior: null,
};

const gimnasio: SubscriptionDTO = {
  ...musicapp, key: "GIMNASIO NORTE", nombre: "GIMNASIO NORTE", busqueda: "GIMNASIO NORTE", categoria: "Deportes",
  montoActual: 30000, montoMensualArs: 30000, primerCobro: "2026-01-03", ultimoCobro: "2026-05-03",
  proximoCobro: "2026-06-03", cobros: 5, estado: "cortada", aumento: null,
};

const plan: SubscriptionDTO = {
  ...musicapp, key: "PLAN AUTOAHORRO", nombre: "PLAN AUTOAHORRO-X", busqueda: "PLAN AUTOAHORRO-X",
  categoria: "Auto", montoActual: 250000, montoMensualArs: 250000, aumento: null, oculta: true,
};

const report: SubscriptionsReportDTO = {
  cotizacionOficial: 1465, totalMensualArs: 24520.35, totalMensualUsd: 12.99, totalAnualArs: 294244.2,
  items: [streamflix, musicapp, gimnasio, plan],
};

const money = (amount: number, currency: Currency): string => formatMoney(amount, currency).replace(/\s/g, " ");

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const serve = (body: SubscriptionsReportDTO): void => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    (url.includes("/subscriptions/hidden/") ? new Response(null, { status: 204 }) : json(body))));
};

const mutations = (): string[] => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === "PUT" || init?.method === "DELETE")
  .map(([url, init]) => `${init?.method} ${String(url)}`);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SubscriptionsPage", () => {
  it("muestra el título mientras carga", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderWithProviders(<SubscriptionsPage />, { route: "/suscripciones" });
    expect(screen.getByRole("heading", { level: 4, name: "Suscripciones" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("muestra los KPIs, las activas con su aumento y las que dejaron de cobrarse", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />, { route: "/suscripciones" });
    const activas = await screen.findByRole("table", { name: "Suscripciones activas" });
    expect(screen.getAllByText("Por mes")).toHaveLength(2);
    expect(screen.getByText("Por año")).toBeInTheDocument();
    expect(screen.getByText("Subieron")).toBeInTheDocument();
    expect(screen.getByText(`2 activas · incluye ${money(12.99, "USD")} al oficial`)).toBeInTheDocument();
    expect(screen.getByText(`${money(30000, "ARS")} menos por mes`)).toBeInTheDocument();
    expect(within(activas).getByText("STREAMFLIX.COM")).toBeInTheDocument();
    expect(within(activas).getByText("Antes se cobraba en pesos")).toBeInTheDocument();
    expect(within(activas).getByText("Subió 10,0% desde marzo de 2026")).toBeInTheDocument();
    expect(within(activas).getByText("próximo ~2026-09-12")).toBeInTheDocument();
    expect(within(activas).queryByText("PLAN AUTOAHORRO-X")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dejaron de cobrarse" })).toBeInTheDocument();
    const cortadas = screen.getByRole("table", { name: "Suscripciones que dejaron de cobrarse" });
    expect(within(cortadas).getByText("GIMNASIO NORTE")).toBeInTheDocument();
    expect(within(cortadas).getByText("Último monto")).toBeInTheDocument();
    expect(
      screen.getByText(`Dólares al oficial de hoy (${money(1465, "ARS")}), sin impuestos ni percepciones.`),
    ).toBeInTheDocument();
  });

  it("ocultar manda el PUT con la clave codificada", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Ocultar STREAMFLIX.COM" }));
    await waitFor(() => expect(mutations()).toEqual(["PUT /api/subscriptions/hidden/STREAMFLIX%20COM"]));
  });

  it("«Mostrar» dentro de «Ocultas (1)» manda el DELETE", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Ocultas \(1\)/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Mostrar PLAN AUTOAHORRO-X" }));
    await waitFor(() => expect(mutations()).toEqual(["DELETE /api/subscriptions/hidden/PLAN%20AUTOAHORRO"]));
  });

  it("el link de movimientos busca el comercio en todos los años", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const link = await screen.findByRole("link", { name: "Ver movimientos de STREAMFLIX.COM" });
    expect(link).toHaveAttribute("href", "/transactions?year=all&search=STREAMFLIX");
  });

  it("sin cotización avisa que los dólares no suman en pesos", async () => {
    serve({
      ...report, cotizacionOficial: null, totalMensualArs: 5490, totalAnualArs: 65880,
      items: [musicapp, { ...streamflix, montoMensualArs: null }],
    });
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText(`2 activas · sin cotización para ${money(12.99, "USD")}`)).toBeInTheDocument();
    expect(screen.queryByText(/Dólares al oficial de hoy/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dejaron de cobrarse" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ocultas/ })).not.toBeInTheDocument();
  });

  it("si todas están ocultas avisa que no hay activas", async () => {
    serve({ ...report, totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0, items: [plan] });
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText("No hay cobros recurrentes activos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ocultas \(1\)/ })).toBeInTheDocument();
  });

  it("sin cobros recurrentes muestra el estado vacío", async () => {
    serve({ cotizacionOficial: 1465, totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0, items: [] });
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText(/No encontramos cobros recurrentes/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Suscripciones" })).toBeInTheDocument();
  });

  it("si el server falla muestra el error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "boom" }, 500)));
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText("No pudimos calcular las suscripciones.")).toBeInTheDocument();
  });
});

describe("SubscriptionsPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra tarjetas en lugar de tablas", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const card = await screen.findByRole("article", { name: "MUSICAPP" });
    expect(within(card).getByText("+10,0%")).toBeInTheDocument();
    expect(within(card).getByText("ICBC · Suscripciones")).toBeInTheDocument();
    expect(within(card).getByText("Por mes")).toBeInTheDocument();
    const stopped = screen.getByRole("article", { name: "GIMNASIO NORTE" });
    expect(within(stopped).getByText("Último monto")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("ocultar desde la tarjeta manda el PUT", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const card = await screen.findByRole("article", { name: "STREAMFLIX.COM" });
    await userEvent.click(within(card).getByRole("button", { name: "Ocultar STREAMFLIX.COM" }));
    await waitFor(() => expect(mutations()).toEqual(["PUT /api/subscriptions/hidden/STREAMFLIX%20COM"]));
  });

  it("el detalle trae el próximo cobro, el aumento y el link a movimientos", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const card = await screen.findByRole("article", { name: "MUSICAPP" });
    await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
    expect(within(card).getByText("2026-09-12")).toBeInTheDocument();
    expect(
      within(card).getByText(`${money(4990, "ARS")} → ${money(5490, "ARS")} desde marzo de 2026`),
    ).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Ver movimientos de MUSICAPP" }))
      .toHaveAttribute("href", "/transactions?year=all&search=MUSICAPP");
  });

  it("la moneda anterior aparece en el detalle", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    const card = await screen.findByRole("article", { name: "STREAMFLIX.COM" });
    await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
    expect(within(card).getByText("Antes se cobraba en pesos")).toBeInTheDocument();
  });
});
