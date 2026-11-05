import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CardServiceDTO, FixedServiceDTO } from "@ledgerly/shared";
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

const gasco: CardServiceDTO = {
  key: "GASCO", nombre: "GASCO", issuer: "visa_signature", cardLabel: "Visa Signature", ultimoMonto: 20_000,
  ultimoCargo: "2026-09-20",
};

const money = (value: number): string => formatMoney(value, "ARS").replace(/\s/g, " ");

let listReply: StubReply;
let mutationReply: StubReply;
let cardReply: StubReply;

const respond = ({ status, body }: StubReply): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  listReply = { status: 200, body: [luz, gas, cable] };
  mutationReply = { status: 200, body: luz };
  cardReply = { status: 200, body: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.includes("/card-services") && method === "GET") return respond(cardReply);
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

  it("Agregar servicio deja cargar uno anual en su mes de pago", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Servicios activos" });
    await userEvent.click(screen.getByRole("button", { name: "Agregar servicio" }));
    const sheet = screen.getByRole("dialog", { name: "Nuevo servicio" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Nombre" }), "ABL");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Monto en pesos" }), "120.000");
    await userEvent.click(within(sheet).getByRole("button", { name: "Anual" }));
    expect(within(sheet).getByText("El mes en que lo pagás")).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText("Desde"), { target: { value: "2027-01" } });
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("POST")).toEqual([{
      url: "/api/fixed-services",
      body: { nombre: "ABL", monto: 120_000, cadencia: "anual", desde: "2027-01" },
    }]));
  });

  it("un servicio anual muestra su doceavo por mes", async () => {
    const abl: FixedServiceDTO = { ...luz, id: "f-abl", nombre: "ABL", monto: 120_000, cadencia: "anual", desde: "2027-01" };
    listReply = { status: 200, body: [abl] };
    renderPage();
    const ablRow = within(await screen.findByRole("table", { name: "Servicios activos" })).getByRole("row", { name: /ABL/ });
    expect(within(ablRow).getByText("Anual")).toBeInTheDocument();
    expect(within(ablRow).getByText(money(10_000))).toBeInTheDocument();
    expect(screen.getByText("bimestrales y anuales, prorrateados")).toBeInTheDocument();
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

describe("FixedServicesPage: servicios de la tarjeta", () => {
  it("explica que lo de la tarjeta se marca desde Movimientos", async () => {
    renderPage();
    expect(await screen.findByText(/lo que llega en el resumen marcalo desde Movimientos con «Es un servicio»/)).toBeInTheDocument();
  });

  it("lista los servicios de la tarjeta en su sección, entre los activos y los dados de baja", async () => {
    cardReply = { status: 200, body: [gasco] };
    renderPage();
    const enTarjeta = await screen.findByRole("table", { name: "Servicios en la tarjeta" });
    const row = within(enTarjeta).getByRole("row", { name: /GASCO/ });
    expect(within(row).getByText("Visa Signature")).toBeInTheDocument();
    expect(within(row).getByText("2026-09-20")).toBeInTheDocument();
    expect(within(row).getByText(money(20_000))).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 6 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Activos", "En la tarjeta", "Dados de baja"]);
  });

  it("Quitar pide confirmación y manda el DELETE con la clave", async () => {
    cardReply = { status: 200, body: [gasco] };
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "quitar GASCO de Servicios" }));
    const confirm = await screen.findByRole("dialog", { name: "Quitar de Servicios" });
    expect(confirm).toHaveTextContent("¿Sacar «GASCO» de Servicios? Sus cargos vuelven a contar en Tarjetas.");
    await userEvent.click(within(confirm).getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(requests("DELETE")).toEqual([{ url: "/api/card-services/GASCO", body: undefined }]));
  });

  it("con solo servicios de tarjeta no muestra el vacío ni la sección de activos", async () => {
    listReply = { status: 200, body: [] };
    cardReply = { status: 200, body: [gasco] };
    renderPage();
    expect(await screen.findByRole("table", { name: "Servicios en la tarjeta" })).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no cargaste servicios/)).not.toBeInTheDocument();
    expect(screen.queryByText("No hay servicios activos.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 6, name: "Activos" })).not.toBeInTheDocument();
    expect(screen.getByText("Por mes")).toBeInTheDocument();
  });

  it("sin servicios cargados ni de tarjeta muestra el vacío", async () => {
    listReply = { status: 200, body: [] };
    renderPage();
    expect(await screen.findByText(/Todavía no cargaste servicios/)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Servicios en la tarjeta" })).not.toBeInTheDocument();
  });

  it("si falla la carga de los de la tarjeta lo dice", async () => {
    cardReply = { status: 500, body: { error: "Error interno" } };
    renderPage();
    expect(await screen.findByText("No pudimos cargar los servicios.")).toBeInTheDocument();
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

  it("muestra los servicios de la tarjeta como tarjetas y deja quitarlos", async () => {
    cardReply = { status: 200, body: [gasco] };
    renderPage();
    const section = await screen.findByRole("region", { name: "Servicios en la tarjeta" });
    const card = within(section).getByRole("article", { name: "GASCO" });
    expect(within(card).getByText("Visa Signature")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "quitar GASCO de Servicios" }));
    expect(await screen.findByRole("dialog", { name: "Quitar de Servicios" })).toBeInTheDocument();
  });
});
