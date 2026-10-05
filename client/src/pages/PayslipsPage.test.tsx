import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flushAsync } from "../testing/flushAsync.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { PayslipsPage } from "./PayslipsPage.js";
import { emulateMobile } from "../testing/viewport.js";

const payslip = (id: string, periodo: string) => ({
  id, periodo, tipo: "mensual", fechaPago: `${periodo}-05`, cuil: "20-12345678-3",
  conceptos: [{ codigo: "1", label: "Sueldo básico", tipo: "remunerativo", monto: 1000 }],
  remunerativo: 1000, noRemunerativo: 0, descuentos: 170, brutoTotal: 1000, neto: 830,
  costoTotalEmpleador: null, tipoCambioUsd: 1000, tipoCambioSource: "api", netoUsd: 0.83,
});

const summary = {
  periodos: 2, ultimoPeriodo: "2026-03", ultimoNeto: 830, ultimoNetoUsd: 0.83, ultimoBruto: 1000,
  variacionNetoMensual: 0, porcentajeDescuentos: 0.17, netoAcumuladoAnio: 830, recibosAnio: 1,
};

function route(url: string) {
  if (url.includes("/payslips/summary")) return summary;
  if (url.includes("/payslips")) return [payslip("p1", "2025-11"), payslip("p2", "2026-03")];
  if (url.includes("/inflation")) return [];
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

describe("PayslipsPage", () => {
  it("por defecto el detalle muestra solo el año actual y los KPIs siguen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00"));
    renderWithProviders(<PayslipsPage />, { route: "/sueldo" });
    const table = await screen.findByRole("table");
    expect(within(table).getByText("2026-03")).toBeInTheDocument();
    expect(within(table).queryByText("2025-11")).not.toBeInTheDocument();
    expect(await screen.findByText("Último neto")).toBeInTheDocument();
  });

  it("con year=all muestra todos los recibos y ofrece el filtro de Año", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const table = await screen.findByRole("table");
    expect(within(table).getByText("2025-11")).toBeInTheDocument();
    expect(within(table).getByText("2026-03")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /año/i })).toHaveTextContent("Todos");
    expect(screen.queryByRole("group", { name: /filtrar gráficos por año/i })).not.toBeInTheDocument();
  });

  it("con un año sin recibos no muestra el detalle vacío", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=2019" });
    await waitFor(() => expect(screen.getByText("Último neto")).toBeInTheDocument());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Detalle mes a mes")).not.toBeInTheDocument();
  });
});

const patches = () => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === "PATCH")
  .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init?.body)) as unknown }));

const openRateSheet = async (periodo: string) => {
  const card = await screen.findByRole("article", { name: periodo });
  await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
  await userEvent.click(within(card).getByRole("button", { name: `editar TC recibo ${periodo}` }));
  return screen.getByRole("dialog", { name: `TC recibo ${periodo}` });
};

describe("PayslipsPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra el detalle mes a mes como tarjetas, sin tabla", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const card = await screen.findByRole("article", { name: "2026-03" });
    expect(within(card).getByText("Neto USD")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
    expect(within(card).getByText("Bruto")).toBeInTheDocument();
    expect(within(card).getByText("Descuentos")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "2025-11" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("marca el aguinaldo con el chip SAC", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.includes("/payslips/summary") ? summary
        : url.includes("/payslips") ? [{ ...payslip("p3", "2026-06"), tipo: "sac" }]
        : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const card = await screen.findByRole("article", { name: "2026-06 SAC" });
    expect(within(card).getByText("SAC")).toBeInTheDocument();
  });

  it("cambiar el TC desde la hoja manda el PATCH del recibo", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const sheet = await openRateSheet("2026-03");
    const input = within(sheet).getByRole("textbox", { name: "TC oficial" });
    expect(input).toHaveValue("1000");
    await userEvent.clear(input);
    await userEvent.type(input, "1205,75");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(patches()).toEqual([{ url: "/api/payslips/p2", body: { tipoCambioUsd: 1205.75 } }]));
  });

  it("el recibo SAC se distingue del mensual del mismo mes y su hoja edita su propio TC", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.includes("/payslips/summary") ? summary
        : url.includes("/payslips") ? [payslip("p1", "2025-12"), { ...payslip("p2", "2025-12"), tipo: "sac", tipoCambioUsd: 1100 }]
        : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const monthly = await openRateSheet("2025-12");
    expect(within(monthly).getByRole("textbox", { name: "TC oficial" })).toHaveValue("1000");
    await userEvent.click(within(monthly).getByRole("button", { name: "Cancelar" }));
    const sac = await openRateSheet("2025-12 SAC");
    const input = within(sac).getByRole("textbox", { name: "TC oficial" });
    expect(input).toHaveValue("1100");
    await userEvent.clear(input);
    await userEvent.type(input, "1250");
    await userEvent.click(within(sac).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(patches()).toEqual([{ url: "/api/payslips/p2", body: { tipoCambioUsd: 1250 } }]));
  });

  it("un TC igual al actual o vacío no manda nada", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const sheet = await openRateSheet("2026-03");
    const save = within(sheet).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    await userEvent.clear(within(sheet).getByRole("textbox", { name: "TC oficial" }));
    expect(save).toBeDisabled();
    fireEvent.click(save);
    await flushAsync();
    expect(patches()).toEqual([]);
  });
});

const conBasico = (id: string, periodo: string, basico: number, bruto: number) => ({
  ...payslip(id, periodo),
  conceptos: [{ codigo: "0201", label: "SUELDO", tipo: "remunerativo", monto: basico }],
  brutoTotal: bruto,
});

const ajustes = [
  conBasico("a1", "2025-01", 1000, 1200),
  conBasico("a2", "2025-02", 1000, 1200),
  conBasico("a3", "2025-03", 1100, 1380),
];

const stubApi = (payslips: unknown[], inflation: [string, number][]) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/payslips/summary") ? summary
      : url.includes("/payslips") ? payslips
      : url.includes("/inflation") ? inflation.map(([periodo, variacionMensual]) => ({ periodo, variacionMensual }))
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
};

const rowIn = (container: HTMLElement, periodo: string) => {
  const row = within(container).getAllByRole("row").find((candidate) => within(candidate).queryByText(periodo));
  if (!row) throw new Error(`sin fila para ${periodo}`);
  return row;
};

const periodosIn = (table: HTMLElement): string[] =>
  within(table).getAllByRole("row").slice(1).map((row) => row.querySelector("td")?.textContent ?? "");

const cardNames = (container: HTMLElement): string[] =>
  within(container).getAllByRole("article").map((card) => card.getAttribute("aria-label") ?? "");

const choose = async (label: string, option: string) => {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
};

const openRaises = async () => {
  await userEvent.click(await screen.findByRole("button", { name: /Ajustes vs IPC/ }));
  return screen.getByRole("region", { name: /Ajustes vs IPC/ });
};

describe("PayslipsPage detalle mes a mes", () => {
  it("la tabla de recibos no muestra las columnas del IPC", async () => {
    stubApi(ajustes, [["2025-01", 2], ["2025-02", 3]]);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Período/ })).toBeInTheDocument();
    for (const header of ["Aumento básico", "Aumento bruto", "IPC acumulado", "vs IPC"]) {
      expect(within(table).queryByRole("columnheader", { name: header })).not.toBeInTheDocument();
    }
    expect(within(table).queryByText("Real +4,7%")).not.toBeInTheDocument();
  });

  it("el encabezado Período invierte el orden", async () => {
    stubApi(ajustes, []);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const table = await screen.findByRole("table");
    expect(periodosIn(table)).toEqual(["2025-03", "2025-02", "2025-01"]);
    await userEvent.click(within(table).getByRole("button", { name: "Período" }));
    expect(periodosIn(table)).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("filtra por tipo de recibo", async () => {
    stubApi([...ajustes, { ...conBasico("s1", "2024-12", 1000, 600), tipo: "sac" }], []);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const table = await screen.findByRole("table");
    await choose("Tipo", "SAC");
    expect(periodosIn(table)).toEqual(["2024-12SAC"]);
    await choose("Tipo", "Mensual");
    expect(periodosIn(table)).toEqual(["2025-03", "2025-02", "2025-01"]);
  });

  it("filtra por rango de meses", async () => {
    stubApi(ajustes, []);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const table = await screen.findByRole("table");
    await choose("Desde", "Febrero de 2025");
    expect(periodosIn(table)).toEqual(["2025-03", "2025-02"]);
    await choose("Hasta", "Febrero de 2025");
    expect(periodosIn(table)).toEqual(["2025-02"]);
  });

  it("si los filtros no dejan recibos lo avisa", async () => {
    stubApi(ajustes, []);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    await screen.findByRole("table");
    await choose("Tipo", "SAC");
    expect(screen.getByText("No hay recibos con estos filtros.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("PayslipsPage ajustes por IPC", () => {
  it("la sección arranca cerrada y al abrirla lista solo los meses con ajuste", async () => {
    stubApi(ajustes, [["2025-01", 2], ["2025-02", 3]]);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const toggle = await screen.findByRole("button", { name: "Ajustes vs IPC (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("table")).toHaveLength(1);
    const region = await openRaises();
    const table = within(region).getByRole("table");
    expect(periodosIn(table)).toEqual(["2025-03"]);
    const ajuste = rowIn(table, "2025-03");
    expect(within(ajuste).getByText("10,0%")).toBeInTheDocument();
    expect(within(ajuste).getByText("15,0%")).toBeInTheDocument();
    expect(within(ajuste).getByTitle("IPC de 2025-01 a 2025-02")).toHaveTextContent("5,1%");
    expect(within(ajuste).getByText("Real +4,7%")).toBeInTheDocument();
  });

  it("sin ajustes en el año no muestra la sección", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: /Ajustes vs IPC/ })).not.toBeInTheDocument();
  });

  it("un ajuste por debajo del IPC se marca como Debajo", async () => {
    stubApi(ajustes, [["2025-01", 10], ["2025-02", 1]]);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const region = await openRaises();
    expect(within(rowIn(region, "2025-03")).getByText("Debajo −1,0%")).toBeInTheDocument();
  });

  it("si falta el IPC de un mes avisa que es parcial y cuál falta", async () => {
    stubApi(ajustes, [["2025-01", 2]]);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const ajuste = rowIn(await openRaises(), "2025-03");
    expect(within(ajuste).getByText("IPC parcial")).toBeInTheDocument();
    expect(within(ajuste).getByTitle("IPC de 2025-01 a 2025-02 · falta 2025-02")).toHaveTextContent("2,0%");
  });

  it("con un año filtrado compara contra el último ajuste del año anterior", async () => {
    stubApi(
      [conBasico("b1", "2025-09", 1000, 1000), conBasico("b2", "2026-01", 1100, 1100)],
      [["2025-09", 1], ["2025-10", 1], ["2025-11", 1], ["2025-12", 1]],
    );
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=2026" });
    const ajuste = rowIn(await openRaises(), "2026-01");
    expect(within(ajuste).getByTitle("IPC de 2025-09 a 2025-12")).toHaveTextContent("4,1%");
    expect(within(ajuste).getByText("Real +5,7%")).toBeInTheDocument();
  });

  it("el filtro de veredicto deja solo esos ajustes y Período invierte el orden", async () => {
    stubApi(
      [...ajustes, conBasico("a4", "2025-05", 1155, 1449)],
      [["2025-01", 2], ["2025-02", 3], ["2025-03", 2], ["2025-04", 3]],
    );
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const table = within(await openRaises()).getByRole("table");
    expect(periodosIn(table)).toEqual(["2025-05", "2025-03"]);
    await userEvent.click(within(table).getByRole("button", { name: "Período" }));
    expect(periodosIn(table)).toEqual(["2025-03", "2025-05"]);
    await choose("Veredicto", "Solo IPC");
    expect(periodosIn(table)).toEqual(["2025-05"]);
  });
});

describe("PayslipsPage en mobile con filtros y ajustes", () => {
  beforeEach(() => emulateMobile());

  it("el botón de orden invierte las tarjetas", async () => {
    stubApi(ajustes, []);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    await screen.findByRole("article", { name: "2025-03" });
    expect(cardNames(document.body)).toEqual(["2025-03", "2025-02", "2025-01"]);
    await userEvent.click(screen.getByRole("button", { name: "Más nuevos primero" }));
    expect(cardNames(document.body)).toEqual(["2025-01", "2025-02", "2025-03"]);
    expect(screen.getByRole("button", { name: "Más viejos primero" })).toBeInTheDocument();
  });

  it("las tarjetas de recibos ya no muestran el veredicto del IPC", async () => {
    stubApi(ajustes, [["2025-01", 2], ["2025-02", 3]]);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const card = await screen.findByRole("article", { name: "2025-03" });
    expect(within(card).queryByText("Real +4,7%")).not.toBeInTheDocument();
  });

  it("la sección de ajustes muestra una tarjeta por ajuste con el veredicto y el IPC", async () => {
    stubApi(ajustes, [["2025-01", 2], ["2025-02", 3]]);
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const region = await openRaises();
    expect(cardNames(region)).toEqual(["2025-03"]);
    const card = within(region).getByRole("article", { name: "2025-03" });
    expect(within(card).getByText("Real +4,7%")).toBeInTheDocument();
    expect(within(card).getByText("Aumento básico").nextSibling).toHaveTextContent("10,0%");
    expect(within(card).getByText("IPC acumulado").nextSibling).toHaveTextContent("5,1%");
    await userEvent.click(within(card).getByRole("button", { name: "Ver detalle" }));
    expect(within(card).getByText("Aumento bruto").nextSibling).toHaveTextContent("15,0%");
    expect(within(card).getByText("Meses IPC").nextSibling).toHaveTextContent("2025-01 a 2025-02");
  });
});
