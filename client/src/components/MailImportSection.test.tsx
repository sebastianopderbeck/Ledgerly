import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GmailStatusDTO, MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { formatLocalDate } from "../format.js";
import { MailImportSection } from "./MailImportSection.js";

const RECEIVED_AT = "2026-09-28T12:00:00.000Z";
const QUERY = "has:attachment filename:pdf newer_than:90d";

const item = (id: string, outcome: MailSyncItemDTO["outcome"], overrides: Partial<MailSyncItemDTO> = {}): MailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: RECEIVED_AT, outcome, kind: null, documentId: null,
  detail: "Formato de resumen no reconocido", ...overrides,
});

const runOf = (overrides: Partial<MailSyncRunDTO> = {}): MailSyncRunDTO => ({
  source: "gmail", trigger: "manual", startedAt: "2026-10-03T17:05:00.000Z", finishedAt: "2026-10-03T17:05:09.000Z", status: "ok", error: null,
  messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

const SYNC_RUN = runOf({
  messagesChecked: 3,
  items: [
    item("resumen-visa", "imported", { kind: "statement", documentId: "s1", detail: "Visa Signature ****1234 · 42 movimientos" }),
    item("recibo-septiembre", "duplicate", { kind: "payslip", documentId: "p1", detail: "Período 2026-09" }),
    item("factura-luz", "skipped"),
  ],
});

const DISABLED: GmailStatusDTO = {
  enabled: false, missing: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
  query: null, intervalMinutes: null, lastRun: null,
};

const enabled = (lastRun: MailSyncRunDTO | null = null): GmailStatusDTO => ({
  enabled: true, missing: [], query: QUERY, intervalMinutes: 360, lastRun,
});

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface ApiHandlers {
  status: () => Response;
  sync?: () => Response | Promise<Response>;
}

const calls: { url: string; method: string }[] = [];

const stubApi = ({ status, sync = () => respond(SYNC_RUN) }: ApiHandlers) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    return url === "/api/gmail/sync" && method === "POST" ? sync() : status();
  }));
};

const searchButton = () => screen.findByRole("button", { name: "Buscar en Gmail" });

beforeEach(() => {
  calls.length = 0;
  emulateDesktop();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MailImportSection", () => {
  it("deshabilitada explica qué falta y no ofrece buscar", async () => {
    stubApi({ status: () => respond(DISABLED) });
    renderWithProviders(<MailImportSection />);
    expect(screen.getByRole("heading", { level: 2, name: "Gmail" })).toBeInTheDocument();
    expect(await screen.findByText("Importación desde Gmail deshabilitada")).toBeInTheDocument();
    expect(screen.getByText(/Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN en el \.env del server/))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buscar en gmail/i })).not.toBeInTheDocument();
  });

  it("si falla el status muestra el error", async () => {
    stubApi({ status: () => respond({ error: "Mongo caído" }, 500) });
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText("Mongo caído")).toBeInTheDocument();
  });

  it("habilitada y sin corridas invita a buscar", async () => {
    stubApi({ status: () => respond(enabled()) });
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText("Todavía no buscaste en Gmail.")).toBeInTheDocument();
    expect(screen.getByText("Búsqueda automática: cada 6 h")).toBeInTheDocument();
    expect(screen.getByText(`Consulta: ${QUERY}`)).toBeInTheDocument();
    expect(await searchButton()).toBeEnabled();
  });

  it("buscar llama a la API y muestra el resumen y los archivos", async () => {
    stubApi({ status: () => respond(enabled()) });
    renderWithProviders(<MailImportSection />);
    await userEvent.click(await searchButton());
    expect(await screen.findByText("Revisé 3 mails nuevos: 1 importado · 1 ya estaba · 1 omitido")).toBeInTheDocument();
    expect(calls).toContainEqual({ url: "/api/gmail/sync", method: "POST" });
    expect(screen.getByText("resumen-visa.pdf")).toBeInTheDocument();
    expect(screen.getByText("Importado")).toBeInTheDocument();
    expect(screen.getByText(`Tarjeta · Visa Signature ****1234 · 42 movimientos · ${formatLocalDate(RECEIVED_AT)}`))
      .toBeInTheDocument();
    expect(screen.getByText("recibo-septiembre.pdf")).toBeInTheDocument();
    expect(screen.getByText("Ya estaba")).toBeInTheDocument();
    expect(screen.queryByText("factura-luz.pdf")).not.toBeInTheDocument();
    expect(screen.getByText(/^Última búsqueda: .+ \(manual\)$/)).toBeInTheDocument();
  });

  it("mientras busca el botón dice «Buscando…» y queda deshabilitado", async () => {
    let settle: (response: Response) => void = () => {};
    stubApi({
      status: () => respond(enabled()),
      sync: () => new Promise<Response>((resolve) => {
        settle = resolve;
      }),
    });
    renderWithProviders(<MailImportSection />);
    await userEvent.click(await searchButton());
    expect(await screen.findByRole("button", { name: "Buscando…" })).toBeDisabled();
    settle(respond(SYNC_RUN));
    expect(await searchButton()).toBeEnabled();
  });

  it("si la búsqueda falla muestra el error del server", async () => {
    stubApi({
      status: () => respond(enabled()),
      sync: () => respond({ error: "Gmail no está configurado: faltan GMAIL_REFRESH_TOKEN" }, 409),
    });
    renderWithProviders(<MailImportSection />);
    await userEvent.click(await searchButton());
    expect(await screen.findByText("Gmail no está configurado: faltan GMAIL_REFRESH_TOKEN")).toBeInTheDocument();
  });

  it("los omitidos se ven al desplegarlos", async () => {
    stubApi({ status: () => respond(enabled(SYNC_RUN)) });
    renderWithProviders(<MailImportSection />);
    const toggle = await screen.findByRole("button", { name: "Ver omitidos (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("factura-luz.pdf")).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(await screen.findByText("factura-luz.pdf")).toBeInTheDocument();
    expect(screen.getByText("Omitido")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar omitidos" })).toHaveAttribute("aria-expanded", "true");
  });

  it("una corrida con error muestra el motivo", async () => {
    const message = "Gmail rechazó el refresh token (venció o fue revocado). Volvé a correr bun run gmail:auth y reiniciá el server.";
    stubApi({ status: () => respond(enabled(runOf({ trigger: "job", status: "error", error: message }))) });
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText(/^Última búsqueda: .+ \(automática\)$/)).toBeInTheDocument();
    expect(screen.queryByText("No había mails nuevos.")).not.toBeInTheDocument();
  });

  it("si quedan mails por revisar lo avisa", async () => {
    stubApi({ status: () => respond(enabled(runOf({ messagesChecked: 50, hasMore: true, items: [item("a", "skipped")] }))) });
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText("Quedan mails por revisar: tocá «Buscar en Gmail» otra vez.")).toBeInTheDocument();
  });

  it("en compu el botón no ocupa todo el ancho", async () => {
    stubApi({ status: () => respond(enabled()) });
    renderWithProviders(<MailImportSection />);
    expect(await searchButton()).not.toHaveClass("MuiButton-fullWidth");
  });

  it("en mobile el botón está presente y ocupa todo el ancho", async () => {
    emulateMobile();
    stubApi({ status: () => respond(enabled(SYNC_RUN)) });
    renderWithProviders(<MailImportSection />);
    expect(await searchButton()).toHaveClass("MuiButton-fullWidth");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ver omitidos (1)" })).toBeInTheDocument());
  });
});
