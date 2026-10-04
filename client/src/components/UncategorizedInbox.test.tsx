import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryRuleDTO, InboxRuleResultDTO, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { cssFor } from "../testing/cssFor.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { UncategorizedInbox } from "./UncategorizedInbox.js";

const group = (overrides: Partial<UncategorizedGroupDTO>): UncategorizedGroupDTO => ({
  pattern: "KIOSCO EL SOL", merchants: ["KIOSCO EL SOL"], count: 6, totalArs: 9000, totalUsd: 0, equivalentArs: 9000,
  lastDate: "2026-09-20", ...overrides,
});

const kiosco = group({});
const panaderia = group({
  pattern: "PANADERIA LA ESPIGA", merchants: ["PANADERIA LA ESPIGA"], count: 6, totalArs: 21400, equivalentArs: 21400,
  lastDate: "2026-09-28",
});
const steam = group({
  pattern: "STEAMGAMES.COM", merchants: ["STEAMGAMES.COM 4259522985", "STEAMGAMES.COM 4259518112"], count: 2,
  totalArs: 0, totalUsd: 19.98, equivalentArs: 28271.7, lastDate: "2026-09-14",
});
const manyGroups = ["ALFA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET"]
  .map((name, position) => group({
    pattern: `COMERCIO ${name}`, merchants: [`COMERCIO ${name}`], count: 1,
    totalArs: 1000 * (10 - position), equivalentArs: 1000 * (10 - position),
  }));

const inboxOf = (groups: UncategorizedGroupDTO[], usdRate: number | null = 1415): UncategorizedInboxDTO => ({
  pendingCount: groups.reduce((sum, item) => sum + item.count, 0), usdRate, groups,
});

const rules: CategoryRuleDTO[] = [
  { id: "r1", priority: 10, matchType: "contains", pattern: "IKEA", category: "Hogar", source: "user", enabled: true },
];

const created = (pattern: string, category: string, categorized: number): InboxRuleResultDTO => ({
  rule: { id: "r2", priority: 100, matchType: "contains", pattern, category, source: "user", enabled: true },
  categorized,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let currentInbox: UncategorizedInboxDTO;
let respondCreate: () => Promise<Response>;
const calls: { url: string; method?: string; body?: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  currentInbox = inboxOf([panaderia, kiosco, steam]);
  respondCreate = async () => jsonResponse(created("PANADERIA LA ESPIGA", "Comida", 6), 201);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (url === "/api/category-rules/inbox/rules") return respondCreate();
    if (url === "/api/category-rules/inbox") return jsonResponse(currentInbox);
    if (url === "/api/transactions/categories") return jsonResponse(["Comida", "Sin categoría", "Transporte"]);
    return jsonResponse({ error: `URL inesperada: ${url}` }, 500);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderInbox = () => renderWithProviders(<UncategorizedInbox rules={rules} />, { route: "/rules" });

const posts = () => calls.filter((call) => call.method === "POST").map(({ url, body }) => ({ url, body }));

const rowOf = (merchant: string): HTMLElement =>
  screen.getByRole("link", { name: `ver movimientos de ${merchant}` }).closest("tr") as HTMLElement;

const merchantsInOrder = () =>
  screen.getAllByRole("link").map((link) => link.getAttribute("aria-label")?.replace("ver movimientos de ", ""));

const chooseCategory = async (row: HTMLElement, category: string) => {
  await userEvent.click(within(row).getByRole("combobox", { name: "Categoría" }));
  await userEvent.click(await screen.findByRole("option", { name: category }));
};

describe("UncategorizedInbox en compu", () => {
  it("muestra cuántos movimientos quedan y en cuántos comercios", async () => {
    renderInbox();
    const section = await screen.findByRole("region", { name: "Sin categoría" });
    expect(within(section).getByLabelText("14 movimientos pendientes")).toHaveTextContent("14");
    expect(within(section).getByText("14 movimientos en 3 comercios")).toBeInTheDocument();
    expect(screen.queryByText(/sin cotización del dólar/i)).not.toBeInTheDocument();
  });

  it("ordena por monto por defecto y por frecuencia al cambiar", async () => {
    renderInbox();
    await screen.findByRole("table");
    expect(merchantsInOrder()).toEqual(["STEAMGAMES.COM 4259522985", "PANADERIA LA ESPIGA", "KIOSCO EL SOL"]);
    expect(screen.getByRole("button", { name: "Monto" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Frecuencia" }));
    expect(merchantsInOrder()).toEqual(["PANADERIA LA ESPIGA", "KIOSCO EL SOL", "STEAMGAMES.COM 4259522985"]);
  });

  it("precarga el patrón sugerido y no deja crear sin categoría", async () => {
    renderInbox();
    await screen.findByRole("table");
    const row = rowOf("PANADERIA LA ESPIGA");
    expect(within(row).getByRole("textbox", { name: "Patrón" })).toHaveValue("PANADERIA LA ESPIGA");
    expect(within(row).getByRole("button", { name: "Crear regla" })).toBeDisabled();
  });

  it("ofrece las categorías existentes, sin «Sin categoría» y con las de las reglas", async () => {
    renderInbox();
    await screen.findByRole("table");
    await userEvent.click(within(rowOf("PANADERIA LA ESPIGA")).getByRole("combobox", { name: "Categoría" }));
    await waitFor(() => expect(screen.getAllByRole("option").map((option) => option.textContent))
      .toEqual(["Comida", "Hogar", "Transporte"]));
  });

  it("crear manda el patrón y la categoría y muestra cuántos movimientos categorizó", async () => {
    renderInbox();
    await screen.findByRole("table");
    const row = rowOf("PANADERIA LA ESPIGA");
    await chooseCategory(row, "Comida");
    await userEvent.click(within(row).getByRole("button", { name: "Crear regla" }));
    await waitFor(() => expect(posts()).toEqual([
      { url: "/api/category-rules/inbox/rules", body: { pattern: "PANADERIA LA ESPIGA", category: "Comida" } },
    ]));
    expect(await screen.findByText("Regla «PANADERIA LA ESPIGA» → Comida: 6 movimientos categorizados.")).toBeInTheDocument();
  });

  it("mientras se crea la regla ningún «Crear regla» se puede volver a tocar", async () => {
    let settle: (response: Response) => void = () => undefined;
    respondCreate = () => new Promise<Response>((resolve) => {
      settle = resolve;
    });
    renderInbox();
    await screen.findByRole("table");
    await chooseCategory(rowOf("KIOSCO EL SOL"), "Transporte");
    const row = rowOf("PANADERIA LA ESPIGA");
    await chooseCategory(row, "Comida");
    await userEvent.click(within(row).getByRole("button", { name: "Crear regla" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Crear regla" })
      .every((button) => button.hasAttribute("disabled"))).toBe(true));
    settle(jsonResponse(created("PANADERIA LA ESPIGA", "Comida", 6), 201));
    await waitFor(() => expect(within(rowOf("KIOSCO EL SOL")).getByRole("button", { name: "Crear regla" })).toBeEnabled());
    expect(posts()).toHaveLength(1);
  });

  it("al categorizar el último comercio muestra la bandeja vacía y el resultado", async () => {
    currentInbox = inboxOf([kiosco]);
    respondCreate = async () => {
      currentInbox = inboxOf([]);
      return jsonResponse(created("KIOSCO EL SOL", "Comida", 6), 201);
    };
    renderInbox();
    await screen.findByRole("table");
    const row = rowOf("KIOSCO EL SOL");
    await chooseCategory(row, "Comida");
    await userEvent.click(within(row).getByRole("button", { name: "Crear regla" }));
    expect(await screen.findByText("No quedan movimientos sin categoría.")).toBeInTheDocument();
    expect(await screen.findByText("Regla «KIOSCO EL SOL» → Comida: 6 movimientos categorizados.")).toBeInTheDocument();
    expect(screen.getByLabelText("0 movimientos pendientes")).toBeInTheDocument();
  });

  it("un patrón que ya no coincide con el comercio no deja crear y lo explica", async () => {
    renderInbox();
    await screen.findByRole("table");
    const row = rowOf("PANADERIA LA ESPIGA");
    await chooseCategory(row, "Comida");
    const pattern = within(row).getByRole("textbox", { name: "Patrón" });
    await userEvent.clear(pattern);
    await userEvent.type(pattern, "KIOSCO");
    expect(within(row).getByText("No coincide con «PANADERIA LA ESPIGA»")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Crear regla" })).toBeDisabled();
  });

  it("«Ver movimientos» lleva a Movimientos filtrado por «Sin categoría» y el comercio", async () => {
    renderInbox();
    const link = await screen.findByRole("link", { name: "ver movimientos de PANADERIA LA ESPIGA" });
    expect(link).toHaveAttribute("href", "/transactions?year=all&category=Sin+categor%C3%ADa&search=PANADERIA+LA+ESPIGA");
  });

  it("sin pendientes avisa que no queda nada y no muestra orden ni tabla", async () => {
    currentInbox = inboxOf([]);
    renderInbox();
    expect(await screen.findByText("No quedan movimientos sin categoría.")).toBeInTheDocument();
    expect(screen.getByLabelText("0 movimientos pendientes")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Ordenar por" })).not.toBeInTheDocument();
  });

  it("muestra 8 comercios y deja ver todos", async () => {
    currentInbox = inboxOf(manyGroups);
    renderInbox();
    await screen.findByRole("table");
    expect(screen.getAllByRole("link")).toHaveLength(8);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar todos (10)" }));
    expect(screen.getAllByRole("link")).toHaveLength(10);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar menos" }));
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });

  it("avisa cuando falta la cotización del dólar y hay montos en USD", async () => {
    currentInbox = inboxOf([steam, panaderia], null);
    renderInbox();
    expect(await screen.findByText("Sin cotización del dólar cargada: los montos en USD no cuentan para ordenar por monto."))
      .toBeInTheDocument();
  });
});

describe("UncategorizedInbox en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra los comercios como lista, sin tabla", async () => {
    renderInbox();
    expect(await screen.findByRole("button", { name: /PANADERIA LA ESPIGA/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("tocar un comercio abre su hoja; elegir categoría y crear manda el POST y la cierra", async () => {
    renderInbox();
    await userEvent.click(await screen.findByRole("button", { name: /PANADERIA LA ESPIGA/ }));
    const sheet = screen.getByRole("dialog", { name: "PANADERIA LA ESPIGA" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Comida" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Crear regla" }));
    await waitFor(() => expect(posts()).toEqual([
      { url: "/api/category-rules/inbox/rules", body: { pattern: "PANADERIA LA ESPIGA", category: "Comida" } },
    ]));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "PANADERIA LA ESPIGA" })).not.toBeInTheDocument());
    expect(await screen.findByText("Regla «PANADERIA LA ESPIGA» → Comida: 6 movimientos categorizados.")).toBeInTheDocument();
  });

  it("si el server rechaza la regla la hoja queda abierta y muestra el error", async () => {
    respondCreate = async () => jsonResponse({ error: "Elegí una categoría" }, 400);
    renderInbox();
    await userEvent.click(await screen.findByRole("button", { name: /PANADERIA LA ESPIGA/ }));
    const sheet = screen.getByRole("dialog", { name: "PANADERIA LA ESPIGA" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Comida" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Crear regla" }));
    expect(await screen.findByText("Elegí una categoría")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "PANADERIA LA ESPIGA" })).toBeInTheDocument();
  });

  it("los toggles de orden, «Mostrar todos» y los botones de la hoja miden 44px", async () => {
    currentInbox = inboxOf(manyGroups);
    renderInbox();
    expect(cssFor(await screen.findByRole("button", { name: "Mostrar todos (10)" }))).toContain("min-height:44px");
    expect(cssFor(screen.getByRole("button", { name: "Monto" }))).toContain("min-height:44px");
    expect(cssFor(screen.getByRole("button", { name: "Frecuencia" }))).toContain("min-height:44px");
    await userEvent.click(screen.getByRole("button", { name: /COMERCIO ALFA/ }));
    const sheet = screen.getByRole("dialog", { name: "COMERCIO ALFA" });
    expect(cssFor(await within(sheet).findByRole("button", { name: "Comida" }))).toContain("min-height:44px");
    expect(cssFor(within(sheet).getByRole("button", { name: "Crear regla" }))).toContain("min-height:44px");
    expect(cssFor(within(sheet).getByRole("link", { name: "Ver movimientos" }))).toContain("min-height:44px");
  });

  it("un comercio largo va en una sola línea", async () => {
    const longName = "COMERCIO CON UN NOMBRE MUY MUY LARGO QUE NO ENTRA EN EL CELULAR";
    currentInbox = inboxOf([group({ pattern: "COMERCIO CON UN", merchants: [longName] })]);
    renderInbox();
    expect(await screen.findByText(longName)).toHaveClass("MuiTypography-noWrap");
  });

  it("el aviso queda arriba de la barra inferior", async () => {
    renderInbox();
    await userEvent.click(await screen.findByRole("button", { name: /KIOSCO EL SOL/ }));
    const sheet = screen.getByRole("dialog", { name: "KIOSCO EL SOL" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Comida" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Crear regla" }));
    await waitFor(() => expect(document.querySelector(".MuiSnackbar-root")).toBeInTheDocument());
    const css = cssFor(document.querySelector(".MuiSnackbar-root")!);
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("64px");
  });
});
