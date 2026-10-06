import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import {
  creditCoupon, creditSummary, ejemploVencimientos, macroSeries, statement,
} from "../testing/vencimientosFixtures.js";
import { emulateMobile } from "../testing/viewport.js";
import { VencimientosPage } from "./VencimientosPage.js";

interface Respuesta { status: number; body?: unknown; }

const visible = (texto: string): string => texto.replace(/\s/g, " ");

const ok = (body: unknown): Respuesta => ({ status: 200, body });
const SIN_CONTENIDO: Respuesta = { status: 204 };

const respuestasDelEjemplo = (): Record<string, Respuesta> => {
  const ejemplo = ejemploVencimientos();
  return {
    "/statements": ok(ejemplo.statements),
    "/credits/coupons": ok(ejemplo.creditCoupons),
    "/credits/summary": ok(ejemplo.creditSummary),
    "/auto/coupons": ok(ejemplo.autoCoupons),
    "/auto/summary": ok(ejemplo.autoSummary),
    "/payslips": ok(ejemplo.payslips),
    "/macro/series": ok(macroSeries(2_000)),
  };
};

const sinDocumentos = (): Record<string, Respuesta> => ({
  "/statements": ok([]),
  "/credits/coupons": ok([]),
  "/credits/summary": SIN_CONTENIDO,
  "/auto/coupons": ok([]),
  "/auto/summary": SIN_CONTENIDO,
  "/payslips": ok([]),
  "/macro/series": ok(macroSeries(2_000)),
});

const stubApi = (respuestas: Record<string, Respuesta>) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url).replace(/^\/api/, "").split("?")[0];
    const { status, body } = respuestas[path] ?? { status: 404, body: { error: "sin stub" } };
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }));
};

const renderPage = () => renderWithProviders(<VencimientosPage />, { route: "/vencimientos" });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00"));
  stubApi(respuestasDelEjemplo());
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VencimientosPage", () => {
  it("con datos agrupa por semana y marca confirmados y estimados", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "La semana que viene" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Vencimientos" })).toBeInTheDocument();
    expect(screen.getByText("De hoy al 31 de diciembre.")).toBeInTheDocument();
    const credito = screen.getByRole("listitem", { name: "Crédito UVA · cuota 25, 5 de octubre, estimado" });
    expect(within(credito).getByText("Estimado")).toBeInTheDocument();
    expect(within(credito).getByText(visible(`≈ ${formatMoney(210_000, "ARS")}`))).toBeInTheDocument();
    const auto = screen.getByRole("listitem", { name: "Plan del auto · cuota 25, 9 de octubre, confirmado" });
    expect(within(auto).getByText("Confirmado")).toBeInTheDocument();
    expect(within(auto).getByText(visible(formatMoney(260_000, "ARS")))).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Esta semana" })).not.toBeInTheDocument();
  });

  it("tocar Mes agrupa por mes y la elección queda guardada", async () => {
    const { unmount } = renderPage();
    await screen.findByRole("heading", { level: 2, name: "La semana que viene" });
    await userEvent.click(screen.getByRole("button", { name: "Mes" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Este mes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Noviembre 2026" })).toBeInTheDocument();
    unmount();
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "Este mes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mes" })).toHaveAttribute("aria-pressed", "true");
  });

  it("los resúmenes con 204 y sin serie macro no son error", async () => {
    stubApi({
      ...respuestasDelEjemplo(),
      "/credits/summary": SIN_CONTENIDO,
      "/auto/summary": SIN_CONTENIDO,
      "/macro/series": { status: 500, body: { error: "sin serie" } },
    });
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "La semana que viene" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const credito = screen.getByRole("listitem", { name: "Crédito UVA · cuota 25, 5 de octubre, estimado" });
    expect(within(credito).getByText("Igual a la cuota 24")).toBeInTheDocument();
  });

  it("mientras carga muestra el título y el spinner", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderPage();
    expect(screen.getByRole("heading", { level: 4, name: "Vencimientos" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("sin documentos invita a importar", async () => {
    stubApi(sinDocumentos());
    renderPage();
    expect(await screen.findByText(/Subilos desde la página Importar/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Agrupar por" })).not.toBeInTheDocument();
  });

  it("si falla la lista de resúmenes muestra el error", async () => {
    stubApi({ ...respuestasDelEjemplo(), "/statements": { status: 500, body: { error: "boom" } } });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los vencimientos. Probá de nuevo en un rato.");
  });

  it("una fuente vieja va a la nota Sin estimar", async () => {
    stubApi({
      ...respuestasDelEjemplo(),
      "/statements": ok([statement({ id: "icbc-05", issuer: "icbc", dueDate: "2026-05-14" })]),
    });
    renderPage();
    expect(await screen.findByText("Sin estimar porque no hay documentos de los últimos 3 meses: ICBC.")).toBeInTheDocument();
  });

  it("con documentos pero nada en el rango muestra el mensaje vacío", async () => {
    stubApi({
      ...sinDocumentos(),
      "/credits/coupons": ok([creditCoupon(23, "2026-04-06"), creditCoupon(24, "2026-05-05")]),
      "/credits/summary": ok(creditSummary(24)),
    });
    renderPage();
    expect(await screen.findByText("No hay pagos ni cobros entre hoy y el 31 de diciembre.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Agrupar por" })).toBeInTheDocument();
    expect(screen.queryByText(/Sin estimar/)).not.toBeInTheDocument();
  });
});

describe("VencimientosPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra la lista, sin tablas, y los dos botones de agrupación", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "La semana que viene" });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    const agrupar = screen.getByRole("group", { name: "Agrupar por" });
    expect(within(agrupar).getByRole("button", { name: "Semana" })).toBeInTheDocument();
    expect(within(agrupar).getByRole("button", { name: "Mes" })).toBeInTheDocument();
  });
});
