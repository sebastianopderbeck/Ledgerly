import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flushAsync } from "../testing/flushAsync.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { RulesPage } from "./RulesPage.js";

const rule = { id: "r1", priority: 10, matchType: "contains", pattern: "UBER", category: "Transporte", source: "user", enabled: true };
const inbox = {
  pendingCount: 2, usdRate: 1415,
  groups: [{ pattern: "KIOSCO EL SOL", merchants: ["KIOSCO EL SOL"], count: 2, totalArs: 3000, totalUsd: 0, equivalentArs: 3000, lastDate: "2026-09-20" }],
};

const readResponse = (url: string): unknown => {
  if (url.includes("/category-rules/inbox")) return inbox;
  if (url.includes("/transactions/categories")) return ["Comida", "Transporte"];
  if (url.includes("/category-rules")) return [rule];
  return {};
};
const calls: { url: string; method?: string; body?: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, body: init?.body as string });
    const isRead = !init || !init.method || init.method === "GET";
    return new Response(JSON.stringify(isRead ? readResponse(url) : {}), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RulesPage", () => {
  it("lista las reglas existentes", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await waitFor(() => expect(screen.getByText("UBER")).toBeInTheDocument());
    expect(screen.getByText("Transporte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reaplicar/i })).toBeInTheDocument();
  });

  it("edita una regla y dispara PATCH con los valores nuevos", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await waitFor(() => expect(screen.getByText("UBER")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("editar"));
    fireEvent.change(screen.getByDisplayValue("Transporte"), { target: { value: "Viajes" } });
    fireEvent.click(screen.getByLabelText("guardar"));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH" && c.url.includes("/category-rules/r1"));
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch!.body!)).toMatchObject({ category: "Viajes", pattern: "UBER", matchType: "contains", priority: 10 });
    });
  });

  it("muestra la bandeja «Sin categoría» antes de la lista de reglas", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    const section = await screen.findByRole("region", { name: "Sin categoría" });
    expect(await within(section).findByText("KIOSCO EL SOL")).toBeInTheDocument();
    const rulesHeading = screen.getByRole("heading", { name: "Reglas" });
    expect(section.compareDocumentPosition(rulesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("«Reaplicar a todo» manda el POST directo, sin confirmación", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: "Reaplicar a todo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(calls.filter((call) => call.method === "POST").map((call) => call.url))
      .toEqual(["/api/category-rules/apply"]));
  });
});

const sent = (method: string) => calls
  .filter((call) => call.method === method)
  .map((call) => ({ url: call.url, body: call.body ? (JSON.parse(call.body) as unknown) : undefined }));

describe("RulesPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra las reglas como tarjetas, sin tabla ni formulario en línea", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    const card = await screen.findByRole("article", { name: "UBER" });
    expect(within(card).getByText("contiene · prioridad 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reaplicar a todo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva regla" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar" })).not.toBeInTheDocument();
  });

  it("la bandeja es una lista que abre una hoja, sin tabla", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: /KIOSCO EL SOL/ }));
    expect(screen.getByRole("dialog", { name: "KIOSCO EL SOL" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("crea una regla desde «Nueva regla» con prioridad 100", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: "Nueva regla" }));
    const sheet = screen.getByRole("dialog", { name: "Nueva regla" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Patrón" }), "RAPPI");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Categoría" }), "Delivery");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("POST")).toEqual([
      { url: "/api/category-rules", body: { priority: 100, matchType: "contains", pattern: "RAPPI", category: "Delivery" } },
    ]));
  });

  it("edita una regla desde su hoja", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: "editar UBER" }));
    const sheet = screen.getByRole("dialog", { name: "Editar regla" });
    const category = within(sheet).getByRole("textbox", { name: "Categoría" });
    await userEvent.clear(category);
    await userEvent.type(category, "Viajes");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("PATCH")).toEqual([
      { url: "/api/category-rules/r1", body: { priority: 10, matchType: "contains", pattern: "UBER", category: "Viajes" } },
    ]));
  });

  it("desactiva una regla con su switch", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("checkbox", { name: "activa UBER" }));
    await waitFor(() => expect(sent("PATCH")).toEqual([{ url: "/api/category-rules/r1", body: { enabled: false } }]));
  });

  it("borrar desde la hoja pide confirmación y recién ahí manda el DELETE", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: "editar UBER" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Editar regla" })).getByRole("button", { name: "Borrar" }));
    expect(sent("DELETE")).toEqual([]);
    const confirm = screen.getByRole("dialog", { name: "Borrar regla" });
    expect(within(confirm).getByText(/¿borrar la regla «UBER»\?/i)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(sent("DELETE")).toEqual([{ url: "/api/category-rules/r1", body: undefined }]));
  });

  it("«Reaplicar a todo» pide confirmación y Cancelar no manda nada", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: "Reaplicar a todo" }));
    const confirm = screen.getByRole("dialog", { name: "Reaplicar reglas" });
    expect(within(confirm).getByText(/recategoriza.*todos los movimientos que coinciden con alguna regla/i)).toBeInTheDocument();
    expect(within(confirm).getByText(/a mano/i)).toBeInTheDocument();
    await flushAsync();
    expect(sent("POST")).toEqual([]);
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reaplicar reglas" })).not.toBeInTheDocument());
    await flushAsync();
    expect(sent("POST")).toEqual([]);
  });

  it("«Reaplicar a todo» manda el POST una sola vez al confirmar", async () => {
    renderWithProviders(<RulesPage />, { route: "/rules" });
    await userEvent.click(await screen.findByRole("button", { name: "Reaplicar a todo" }));
    await flushAsync();
    expect(sent("POST")).toEqual([]);
    await userEvent.click(within(screen.getByRole("dialog", { name: "Reaplicar reglas" })).getByRole("button", { name: "Reaplicar" }));
    await waitFor(() => expect(sent("POST")).toEqual([{ url: "/api/category-rules/apply", body: undefined }]));
  });
});
