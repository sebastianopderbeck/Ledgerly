import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { PayslipsPage } from "./PayslipsPage.js";

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
