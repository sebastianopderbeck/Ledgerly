import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManualAssetDTO, NetWorthDTO, NetWorthItemDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { NetWorthPage } from "./NetWorthPage.js";

interface ChartProbeProps {
  months: { periodo: string }[];
}

vi.mock("../components/charts/NetWorthChart.js", async () => {
  const { createElement } = await import("react");
  return {
    NetWorthChart: ({ months }: ChartProbeProps) =>
      createElement(
        "ul",
        { "aria-label": "meses del gráfico" },
        months.map((mes) => createElement("li", { key: mes.periodo }, mes.periodo)),
      ),
  };
});

interface StubReply {
  status: number;
  body?: unknown;
}

type ItemFields = Partial<NetWorthItemDTO> & Pick<NetWorthItemDTO, "id" | "lado" | "fuente" | "label" | "ars">;

const TODAY = "2026-10-03";
const NO_USD = "No hay cotización del dólar oficial. Actualizá los datos con el botón de la barra superior.";

const ahorros: ManualAssetDTO = {
  id: "a-ahorros", nombre: "Ahorros", tipo: "ahorro", moneda: "USD", valuaciones: [{ fecha: "2026-10-01", monto: 5000 }],
};
const cuenta: ManualAssetDTO = {
  id: "a-cuenta", nombre: "Cuenta", tipo: "cuenta", moneda: "ARS", valuaciones: [{ fecha: "2026-10-01", monto: 500_000 }],
};

const item = (fields: ItemFields): NetWorthItemDTO => ({
  detalle: "", fecha: "2026-10-01", moneda: "ARS", montoOriginal: fields.ars, usd: fields.ars / 1000, assetId: null,
  ...fields,
});

const TOTALES = {
  activosArs: 17_500_000, pasivosArs: 10_068_000, netoArs: 7_432_000,
  activosUsd: 17_500, pasivosUsd: 10_068, netoUsd: 7_432,
};

const NET_WORTH: NetWorthDTO = {
  fecha: TODAY, usdOficial: 1000, usdOficialFecha: "2026-10-02", uva: 2000, uvaFecha: "2026-10-03",
  totales: TOTALES,
  items: [
    item({ id: "auto", lado: "activo", fuente: "auto", label: "Auto", detalle: "MODELO X · valor móvil de la cuota 30", fecha: "2026-09-18", ars: 12_000_000 }),
    item({ id: "a-ahorros", lado: "activo", fuente: "manual", label: "Ahorros", detalle: "Ahorros", moneda: "USD", montoOriginal: 5000, ars: 5_000_000, usd: 5000, assetId: "a-ahorros" }),
    item({ id: "a-cuenta", lado: "activo", fuente: "manual", label: "Cuenta", detalle: "Cuenta", ars: 500_000, assetId: "a-cuenta" }),
    item({ id: "plan-auto", lado: "pasivo", fuente: "plan_auto", label: "Plan de ahorro del auto", detalle: "90 de 120 cuotas por pagar", fecha: "2026-09-18", ars: 9_000_000 }),
    item({ id: "hipoteca", lado: "pasivo", fuente: "hipoteca", label: "Hipoteca UVA", detalle: "499 UVA pendientes", fecha: "2026-10-03", ars: 998_000 }),
    item({ id: "tarjeta:icbc:ARS", lado: "pasivo", fuente: "tarjeta", label: "Cuotas ICBC", detalle: "Último resumen: cierre 2026-09-25", fecha: "2026-09-25", ars: 30_000 }),
  ],
  evolucion: [{ periodo: "2025-12", ...TOTALES }, { periodo: "2026-10", ...TOTALES }],
  activosManuales: [ahorros, cuenta],
};

const MUTATION_REPLIES: Record<string, StubReply> = {
  POST: { status: 201, body: ahorros },
  PATCH: { status: 200, body: ahorros },
  DELETE: { status: 204 },
};

let netWorthReply: StubReply;

const respond = ({ status, body }: StubReply): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  netWorthReply = { status: 200, body: NET_WORTH };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return respond(url === "/api/net-worth" ? netWorthReply : { status: 404, body: { error: "No encontrado" } });
    return respond(MUTATION_REPLIES[method] ?? { status: 405, body: { error: "Método no permitido" } });
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const requests = (method: string) => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === method)
  .map(([url, init]) => ({ url: String(url), body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined }));

const renderPage = (route = "/patrimonio?year=all") => renderWithProviders(<NetWorthPage />, { route });

describe("NetWorthPage", () => {
  it("muestra los KPIs y los ítems de cada lado", async () => {
    renderPage();
    const activos = await screen.findByRole("region", { name: "Activos" });
    const pasivos = screen.getByRole("region", { name: "Pasivos" });
    expect(screen.getByText("Patrimonio neto")).toBeInTheDocument();
    expect(screen.getByText(/Valuado con dólar oficial/)).toHaveTextContent("al 2026-10-02");
    expect(within(activos).getByText("Auto")).toBeInTheDocument();
    expect(within(activos).getByRole("button", { name: "editar Ahorros" })).toBeInTheDocument();
    expect(within(activos).queryByRole("button", { name: "editar Auto" })).not.toBeInTheDocument();
    expect(within(pasivos).getByText("Hipoteca UVA")).toBeInTheDocument();
    expect(within(pasivos).getByText("Cuotas ICBC")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "meses del gráfico" })).toHaveTextContent("2025-12");
  });

  it("con 204 muestra el estado vacío y deja agregar un activo", async () => {
    netWorthReply = { status: 204 };
    renderPage();
    expect(await screen.findByText(/Todavía no hay nada para valuar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Agregar activo" }));
    expect(screen.getByRole("dialog", { name: "Nuevo activo" })).toBeInTheDocument();
  });

  it("con 503 muestra el mensaje del server debajo del título", async () => {
    netWorthReply = { status: 503, body: { error: NO_USD } };
    renderPage();
    expect(await screen.findByText(NO_USD)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Patrimonio" })).toBeInTheDocument();
  });

  it("Agregar activo manda el alta con el valor tipeado en formato argentino", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Activos" });
    await userEvent.click(screen.getByRole("button", { name: "Agregar activo" }));
    const sheet = screen.getByRole("dialog", { name: "Nuevo activo" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Nombre" }), "Dólares del colchón");
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Tipo" }));
    await userEvent.click(await screen.findByRole("option", { name: "Ahorros" }));
    const form = screen.getByRole("dialog", { name: "Nuevo activo" });
    await userEvent.click(within(form).getByRole("button", { name: "Dólares" }));
    await userEvent.type(within(form).getByRole("textbox", { name: "Valor en dólares" }), "10.000");
    await userEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("POST")).toEqual([{
      url: "/api/net-worth/assets",
      body: { nombre: "Dólares del colchón", tipo: "ahorro", moneda: "USD", valuacion: { fecha: TODAY, monto: 10000 } },
    }]));
  });

  it("editar un activo y cambiar el valor manda solo la valuación nueva", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "editar Ahorros" }));
    const sheet = screen.getByRole("dialog", { name: "Editar activo" });
    const value = within(sheet).getByRole("textbox", { name: "Valor en dólares" });
    expect(value).toHaveValue("5.000");
    await userEvent.clear(value);
    await userEvent.type(value, "6.000");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("PATCH")).toEqual([{
      url: "/api/net-worth/assets/a-ahorros",
      body: { valuacion: { fecha: TODAY, monto: 6000 } },
    }]));
  });

  it("Borrar pide confirmación y borra el activo", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "editar Ahorros" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Editar activo" })).getByRole("button", { name: "Borrar" }));
    const confirm = await screen.findByRole("dialog", { name: "Borrar activo" });
    expect(confirm).toHaveTextContent("¿Borrar «Ahorros» y todas sus valuaciones?");
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(requests("DELETE")).toEqual([{ url: "/api/net-worth/assets/a-ahorros", body: undefined }]));
  });

  it("avisa si hay hipoteca y ningún inmueble", async () => {
    renderPage();
    expect(await screen.findByText(/Tenés una hipoteca pero ningún inmueble/)).toBeInTheDocument();
  });

  it("por defecto el gráfico muestra solo el año actual y los KPIs no cambian", async () => {
    renderPage("/patrimonio");
    const chartMonths = await screen.findByRole("list", { name: "meses del gráfico" });
    expect(within(chartMonths).getByText("2026-10")).toBeInTheDocument();
    expect(within(chartMonths).queryByText("2025-12")).not.toBeInTheDocument();
    expect(screen.getByText("Patrimonio neto")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Activos" })).getByText("Auto")).toBeInTheDocument();
  });
});

describe("NetWorthPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("Agregar activo abre la hoja desde abajo", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Activos" });
    await userEvent.click(screen.getByRole("button", { name: "Agregar activo" }));
    expect(screen.getByRole("dialog", { name: "Nuevo activo" }).closest(".MuiDrawer-root")).not.toBeNull();
  });
});
