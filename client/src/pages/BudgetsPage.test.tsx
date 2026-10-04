import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BudgetDTO, BudgetSpendingDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { cssFor } from "../testing/cssFor.js";
import { BudgetsPage } from "./BudgetsPage.js";

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

interface StubOptions {
  budgets?: BudgetDTO[];
  rejectCreate?: boolean;
  failBudgets?: boolean;
}

const BUDGETS: BudgetDTO[] = [
  { id: "b1", category: "Comida", topeArs: 300000, ajustaInflacion: false, periodoBase: "2026-08" },
  { id: "b2", category: "Transporte", topeArs: 100000, ajustaInflacion: false, periodoBase: "2026-08" },
  { id: "b3", category: "Ropa", topeArs: 100000, ajustaInflacion: false, periodoBase: "2026-08" },
];

const SPENDING: BudgetSpendingDTO = {
  ultimoMesCerrado: "2026-09",
  gastos: [
    { month: "2026-08", category: "Comida", total: 250000, count: 10 },
    { month: "2026-08", category: "Ropa", total: 50000, count: 1 },
    { month: "2026-09", category: "Comida", total: 330000, count: 12 },
    { month: "2026-09", category: "Transporte", total: 85000, count: 6 },
    { month: "2026-09", category: "Ropa", total: 20000, count: 1 },
    { month: "2026-09", category: "Farmacia", total: 15000, count: 2 },
    { month: "2026-09", category: "Sin categoría", total: 12000, count: 3 },
    { month: "2026-10", category: "Comida", total: 50000, count: 2 },
  ],
};

const CATEGORIES = ["Comida", "Farmacia", "Ropa", "Sin categoría", "Transporte"];

const calls: FetchCall[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const respond = (url: string, method: string, { budgets = BUDGETS, rejectCreate = false, failBudgets = false }: StubOptions) => {
  if (method === "POST") return rejectCreate ? json({ error: "Ya hay un tope para «Farmacia»" }, 409) : json(BUDGETS[0], 201);
  if (method === "PATCH") return json(BUDGETS[0]);
  if (method === "DELETE") return new Response(null, { status: 204 });
  if (url.startsWith("/api/budgets/spending")) return json(SPENDING);
  if (url === "/api/budgets") return failBudgets ? json({ error: "Se cayó la base" }, 500) : json(budgets);
  if (url.startsWith("/api/inflation")) return json([]);
  if (url.startsWith("/api/transactions/categories")) return json(CATEGORIES);
  if (url.startsWith("/api/category-rules")) return json([]);
  if (url.startsWith("/api/stats/monthly")) return json([{ month: "2026-09", total: 1, count: 1 }]);
  return json({});
};

const stubFetch = (options: StubOptions = {}) => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return respond(url, method, options);
  }));
};

const sent = (method: string) => calls.filter((call) => call.method === method).map(({ url, body }) => ({ url, body }));

const renderPage = (search = "?year=2026") => renderWithProviders(<BudgetsPage />, { route: `/presupuestos${search}` });

const row = (category: string) => screen.getByRole("listitem", { name: category });

const amountField = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: "Tope mensual (ARS)" });

const openCreate = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Nuevo tope" }));
  return screen.getByRole("dialog", { name: "Nuevo tope" });
};

beforeEach(() => stubFetch());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BudgetsPage", () => {
  it("por defecto muestra el último mes cerrado con el estado de cada tope", async () => {
    renderPage();
    expect(await screen.findByText("Septiembre de 2026")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "topes por categoría" });
    expect(within(list).getAllByRole("listitem").map((item) => item.getAttribute("aria-label")))
      .toEqual(["Comida", "Transporte", "Ropa"]);
    expect(within(row("Comida")).getByText("Pasado")).toBeInTheDocument();
    expect(within(row("Transporte")).getByText("Cerca")).toBeInTheDocument();
    expect(within(row("Ropa")).getByText("En rango")).toBeInTheDocument();
    expect(within(row("Comida")).getByText(/^Te pasaste por \$\s30\.000$/)).toBeInTheDocument();
    expect(screen.getByText("Gastado con tope")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByText("87,0% usado")).toBeInTheDocument();
    expect(screen.getByText("1 cerca del tope")).toBeInTheDocument();
    expect(screen.getByText("Cumplimiento mes a mes (topes actuales)")).toBeInTheDocument();
    expect(screen.queryByText("Parcial")).not.toBeInTheDocument();
  });

  it("con Mes en la URL muestra ese mes", async () => {
    renderPage("?year=2026&from=2026-08-01&to=2026-08-31");
    expect(await screen.findByText("Agosto de 2026")).toBeInTheDocument();
    expect(within(row("Comida")).getByText("Cerca")).toBeInTheDocument();
    expect(within(row("Transporte")).getByText("En rango")).toBeInTheDocument();
  });

  it("«mes anterior» pasa al mes de antes y se frena en el primero", async () => {
    renderPage();
    await screen.findByText("Septiembre de 2026");
    await userEvent.click(screen.getByRole("button", { name: "mes anterior" }));
    expect(await screen.findByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mes anterior" })).toBeDisabled();
  });

  it("un mes posterior al último cerrado es parcial", async () => {
    renderPage("?year=2026&from=2026-10-01&to=2026-10-31");
    expect(await screen.findByText("Octubre de 2026")).toBeInTheDocument();
    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.getByText("Mes parcial: faltan consumos que llegan con el próximo resumen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mes siguiente" })).toBeDisabled();
  });

  it("«Ver movimientos» lleva a Movimientos filtrado por la categoría y el mes", async () => {
    renderPage();
    await screen.findByText("Septiembre de 2026");
    expect(within(row("Comida")).getByRole("link", { name: "Ver movimientos" }))
      .toHaveAttribute("href", "/transactions?category=Comida&currency=ARS&from=2026-09-01&to=2026-09-30");
  });

  it("lista lo gastado sin tope y «Sin categoría» lleva a Reglas", async () => {
    renderPage();
    expect(await screen.findByText("Sin tope en septiembre de 2026")).toBeInTheDocument();
    expect(within(row("Farmacia")).getByRole("button", { name: "Poner tope a Farmacia" })).toBeInTheDocument();
    expect(within(row("Sin categoría")).getByRole("link", { name: "Categorizar" })).toHaveAttribute("href", "/rules");
    expect(within(row("Sin categoría")).queryByRole("button", { name: /poner tope/i })).not.toBeInTheDocument();
  });

  it("sin topes da la bienvenida y ofrece poner tope desde las categorías", async () => {
    stubFetch({ budgets: [] });
    renderPage();
    expect(await screen.findByText(/^Todavía no definiste topes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poner tope a Comida" })).toBeInTheDocument();
    expect(screen.queryByText("Gastado con tope")).not.toBeInTheDocument();
    expect(screen.queryByText("Por categoría")).not.toBeInTheDocument();
    expect(screen.queryByText("Cumplimiento mes a mes (topes actuales)")).not.toBeInTheDocument();
  });

  it("crea un tope nuevo eligiendo la categoría", async () => {
    renderPage();
    const dialog = await openCreate();
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Categoría" }));
    await userEvent.click(await screen.findByRole("option", { name: "Farmacia" }));
    await userEvent.type(amountField(dialog), "300.000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("POST")).toEqual([
      { url: "/api/budgets", body: { category: "Farmacia", topeArs: 300000, ajustaInflacion: false } },
    ]));
  });

  it("«Poner tope» abre el editor con la categoría fija", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Poner tope a Farmacia" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    expect(within(dialog).getByRole("textbox", { name: "Categoría" })).toHaveValue("Farmacia");
    await userEvent.type(amountField(dialog), "50.000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("POST")).toEqual([
      { url: "/api/budgets", body: { category: "Farmacia", topeArs: 50000, ajustaInflacion: false } },
    ]));
  });

  it("edita un tope con el monto precargado", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "editar tope de Comida" }));
    const dialog = screen.getByRole("dialog", { name: "Tope de Comida" });
    expect(amountField(dialog)).toHaveValue("300.000");
    await userEvent.clear(amountField(dialog));
    await userEvent.type(amountField(dialog), "350.000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("PATCH")).toEqual([
      { url: "/api/budgets/b1", body: { topeArs: 350000, ajustaInflacion: false } },
    ]));
  });

  it("borrar pide confirmación y recién ahí manda el DELETE", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "editar tope de Comida" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Tope de Comida" })).getByRole("button", { name: "Borrar" }));
    const confirm = screen.getByRole("dialog", { name: "Borrar tope" });
    expect(within(confirm).getByText("¿Borrar el tope de «Comida»? El histórico deja de contarla.")).toBeInTheDocument();
    expect(sent("DELETE")).toEqual([]);
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(sent("DELETE")).toEqual([{ url: "/api/budgets/b1", body: undefined }]));
  });

  it("si el server rechaza el tope muestra su mensaje", async () => {
    stubFetch({ rejectCreate: true });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Poner tope a Farmacia" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    await userEvent.type(amountField(dialog), "1000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Ya hay un tope para «Farmacia»")).toBeInTheDocument();
  });

  it("si falla la carga muestra el error debajo del título", async () => {
    stubFetch({ failBudgets: true });
    renderPage();
    expect(await screen.findByText("Se cayó la base")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Presupuestos" })).toBeInTheDocument();
  });
});

describe("BudgetsPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("«Nuevo tope» abre la hoja desde abajo", async () => {
    renderPage();
    await openCreate();
    expect(document.querySelector(".MuiDrawer-root")).toBeInTheDocument();
  });

  it("las flechas del mes miden 44 px para el pulgar", async () => {
    renderPage();
    await screen.findByText("Septiembre de 2026");
    for (const name of ["mes anterior", "mes siguiente"]) {
      const css = cssFor(screen.getByRole("button", { name }));
      expect(css).toContain("min-width:44px");
      expect(css).toContain("min-height:44px");
    }
  });
});
