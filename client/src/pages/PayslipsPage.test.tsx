import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    fireEvent.click(save);
    expect(patches()).toEqual([]);
  });
});
