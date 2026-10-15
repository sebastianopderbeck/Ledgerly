import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { FixedServicesPage } from "./FixedServicesPage.js";

interface StubReply {
  status: number;
  body?: unknown;
}

const TODAY = "2026-10-14";
const INVALID = "Servicio inválido";

const luz: FixedServiceDTO = {
  id: "f-luz", nombre: "Luz", monto: 30_000, cadencia: "mensual", desde: "2026-09", hasta: null, montoDesde: "2026-09",
};
const gas: FixedServiceDTO = {
  id: "f-gas", nombre: "Gas", monto: 18_000, cadencia: "bimestral", desde: "2026-10", hasta: null, montoDesde: "2026-10",
};
const cable: FixedServiceDTO = {
  id: "f-cable", nombre: "Cable", monto: 15_000, cadencia: "mensual", desde: "2026-01", hasta: "2026-08", montoDesde: "2026-01",
};

const money = (value: number): string => formatMoney(value, "ARS").replace(/\s/g, " ");

let listReply: StubReply;
let mutationReply: StubReply;

const respond = ({ status, body }: StubReply): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  listReply = { status: 200, body: [luz, gas, cable] };
  mutationReply = { status: 200, body: luz };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return respond(listReply);
    if (method === "DELETE") return respond({ status: 204 });
    return respond(mutationReply);
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

const renderPage = () => renderWithProviders(<FixedServicesPage />, { route: "/servicios" });

const editar = async (nombre: string) => {
  await userEvent.click(await screen.findByRole("button", { name: `editar ${nombre}` }));
  return screen.getByRole("dialog", { name: "Editar servicio" });
};

describe("FixedServicesPage", () => {
  it("muestra los activos con su equivalente mensual y los dados de baja aparte", async () => {
    renderPage();
    const activos = await screen.findByRole("table", { name: "Servicios activos" });
    const gasRow = within(activos).getByRole("row", { name: /Gas/ });
    expect(within(gasRow).getByText("Bimestral")).toBeInTheDocument();
    expect(within(gasRow).getByText(money(9_000))).toBeInTheDocument();
    expect(within(activos).getByRole("row", { name: /Luz/ })).toBeInTheDocument();
    expect(within(activos).queryByText("Cable")).not.toBeInTheDocument();
    const deBaja = screen.getByRole("table", { name: "Servicios dados de baja" });
    expect(within(deBaja).getByRole("columnheader", { name: "Hasta" })).toBeInTheDocument();
    expect(within(deBaja).getByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.getByText("Por año")).toBeInTheDocument();
  });

  it("un servicio que empieza más adelante no cuenta en los KPIs y se avisa", async () => {
    const internet: FixedServiceDTO = { ...luz, id: "f-internet", nombre: "Internet", desde: "2026-12", montoDesde: "2026-10" };
    listReply = { status: 200, body: [luz, gas, internet] };
    renderPage();
    expect(await screen.findByText("1 empieza más adelante")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Servicios activos" })).getByRole("row", { name: /Internet/ })).toBeInTheDocument();
  });

  it("sin servicios muestra el estado vacío y deja agregar uno", async () => {
    listReply = { status: 200, body: [] };
    renderPage();
    expect(await screen.findByText(/Todavía no cargaste servicios/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Agregar servicio" }));
    expect(screen.getByRole("dialog", { name: "Nuevo servicio" })).toBeInTheDocument();
  });

  it("si falla la carga lo dice debajo del título", async () => {
    listReply = { status: 500, body: { error: "Error interno" } };
    renderPage();
    expect(await screen.findByText("No pudimos cargar los servicios.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Servicios" })).toBeInTheDocument();
  });

  it("Agregar servicio manda el alta con el monto en formato argentino", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Servicios activos" });
    await userEvent.click(screen.getByRole("button", { name: "Agregar servicio" }));
    const sheet = screen.getByRole("dialog", { name: "Nuevo servicio" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Nombre" }), "Internet");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Monto en pesos" }), "25.000");
    await userEvent.click(within(sheet).getByRole("button", { name: "Bimestral" }));
    fireEvent.change(within(sheet).getByLabelText("Desde"), { target: { value: "2026-11" } });
    expect(within(sheet).queryByLabelText("Hasta")).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("POST")).toEqual([{
      url: "/api/fixed-services",
      body: { nombre: "Internet", monto: 25_000, cadencia: "bimestral", desde: "2026-11" },
    }]));
  });

  it("editar el monto manda solo el monto", async () => {
    renderPage();
    const sheet = await editar("Luz");
    const monto = within(sheet).getByRole("textbox", { name: "Monto en pesos" });
    expect(monto).toHaveValue("30.000");
    await userEvent.clear(monto);
    await userEvent.type(monto, "36.000");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("PATCH")).toEqual([{ url: "/api/fixed-services/f-luz", body: { monto: 36_000 } }]));
  });

  it("completar Hasta da de baja el servicio", async () => {
    renderPage();
    const sheet = await editar("Luz");
    fireEvent.change(within(sheet).getByLabelText("Hasta"), { target: { value: "2026-10" } });
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("PATCH")).toEqual([{ url: "/api/fixed-services/f-luz", body: { hasta: "2026-10" } }]));
  });

  it("si el server rechaza la edición muestra el error y el editor queda abierto", async () => {
    mutationReply = { status: 400, body: { error: INVALID } };
    renderPage();
    const sheet = await editar("Luz");
    fireEvent.change(within(sheet).getByLabelText("Hasta"), { target: { value: "2026-10" } });
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(await within(sheet).findByText(INVALID)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Editar servicio" })).toBeInTheDocument();
  });

  it("Borrar pide confirmación y borra el servicio", async () => {
    renderPage();
    const sheet = await editar("Luz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Borrar" }));
    const confirm = await screen.findByRole("dialog", { name: "Borrar servicio" });
    expect(confirm).toHaveTextContent("¿Borrar «Luz»? Se saca también de los meses pasados del Flujo.");
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(requests("DELETE")).toEqual([{ url: "/api/fixed-services/f-luz", body: undefined }]));
  });
});

describe("FixedServicesPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra los servicios como tarjetas y deja editarlos", async () => {
    renderPage();
    const gasCard = await screen.findByRole("article", { name: "Gas" });
    expect(within(gasCard).getByText(money(9_000))).toBeInTheDocument();
    await userEvent.click(within(gasCard).getByRole("button", { name: "editar Gas" }));
    expect(screen.getByRole("dialog", { name: "Editar servicio" })).toBeInTheDocument();
  });
});
