import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MailSource, MailSourceStatusDTO, MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { formatLocalDate } from "../format.js";
import { MailImportSection } from "./MailImportSection.js";

const RECEIVED_AT = "2026-09-28T12:00:00.000Z";
const QUERY = "has:attachment filename:pdf newer_than:90d";
const ICLOUD_SCOPE = "INBOX · desde el 01/09/2026";
const GMAIL_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];

const item = (id: string, outcome: MailSyncItemDTO["outcome"], overrides: Partial<MailSyncItemDTO> = {}): MailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: RECEIVED_AT, outcome, kind: null, documentId: null,
  detail: "Formato de resumen no reconocido", ...overrides,
});

const runOf = (overrides: Partial<MailSyncRunDTO> = {}): MailSyncRunDTO => ({
  source: "icloud", trigger: "manual", startedAt: "2026-10-03T17:05:00.000Z", finishedAt: "2026-10-03T17:05:09.000Z",
  status: "ok", error: null, messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

const SYNC_RUN = runOf({
  messagesChecked: 3,
  items: [
    item("resumen-icbc", "imported", { kind: "statement", documentId: "s1", detail: "ICBC · 64 movimientos" }),
    item("cupon-hipoteca", "duplicate", { kind: "coupon", documentId: "c1", detail: "Cuota 14" }),
    item("factura-luz", "skipped"),
  ],
});

const disabled = (source: MailSource, missing: string[]): MailSourceStatusDTO =>
  ({ source, enabled: false, missing, scope: null, schedule: null, lastRun: null });

const icloudEnabled = (lastRun: MailSyncRunDTO | null = null): MailSourceStatusDTO =>
  ({ source: "icloud", enabled: true, missing: [], scope: ICLOUD_SCOPE, schedule: "todos los días a las 21 h, del 25 al 5", lastRun });

const GMAIL_ENABLED: MailSourceStatusDTO =
  { source: "gmail", enabled: true, missing: [], scope: QUERY, schedule: null, lastRun: null };

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface ApiHandlers {
  status: () => Response;
  sync?: () => Response | Promise<Response>;
}

const calls: { url: string; method: string }[] = [];
const SYNC_URL = /^\/api\/mail\/\w+\/sync$/;

const stubApi = ({ status, sync = () => respond(SYNC_RUN) }: ApiHandlers) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    return SYNC_URL.test(url) && method === "POST" ? sync() : status();
  }));
};

const withStatuses = (...statuses: MailSourceStatusDTO[]) => stubApi({ status: () => respond(statuses) });

const card = (name: string) => screen.findByRole("region", { name });

const icloudButton = () => screen.findByRole("button", { name: "Buscar en iCloud" });

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
  it("muestra una tarjeta por fuente, iCloud primero", async () => {
    withStatuses(disabled("icloud", ["ICLOUD_USER"]), disabled("gmail", GMAIL_VARS));
    renderWithProviders(<MailImportSection />);
    expect(screen.getByRole("heading", { level: 2, name: "Mails" })).toBeInTheDocument();
    await card("iCloud");
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual(["iCloud", "Gmail"]);
  });

  it("deshabilitadas explican qué falta y no ofrecen buscar", async () => {
    withStatuses(disabled("icloud", ["ICLOUD_USER"]), disabled("gmail", GMAIL_VARS));
    renderWithProviders(<MailImportSection />);
    const icloud = await card("iCloud");
    expect(within(icloud).getByText("Importación desde iCloud deshabilitada")).toBeInTheDocument();
    expect(within(icloud).getByText(
      "Falta ICLOUD_USER. Los pasos están en el README, sección «Importar desde iCloud»; después reiniciá el server.",
    )).toBeInTheDocument();
    const gmail = await card("Gmail");
    expect(within(gmail).getByText(/^Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buscar en/i })).not.toBeInTheDocument();
  });

  it("iCloud sin la contraseña en el Llavero lo dice", async () => {
    withStatuses(disabled("icloud", ["la contraseña de app en el Llavero"]), disabled("gmail", GMAIL_VARS));
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText(/^Falta la contraseña de app en el Llavero\. Los pasos están en el README/)).toBeInTheDocument();
  });

  it("si falla el status muestra el error", async () => {
    stubApi({ status: () => respond({ error: "Mongo caído" }, 500) });
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText("Mongo caído")).toBeInTheDocument();
  });

  it("habilitadas y sin corridas invitan a buscar, cada una con su alcance", async () => {
    withStatuses(icloudEnabled(), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    const icloud = await card("iCloud");
    expect(within(icloud).getByText("Todavía no buscaste en iCloud.")).toBeInTheDocument();
    expect(within(icloud).getByText("Búsqueda automática: todos los días a las 21 h, del 25 al 5")).toBeInTheDocument();
    expect(within(icloud).getByText(`Revisa: ${ICLOUD_SCOPE}`)).toBeInTheDocument();
    expect(await icloudButton()).toBeEnabled();
    const gmail = await card("Gmail");
    expect(within(gmail).getByText(`Consulta: ${QUERY}`)).toBeInTheDocument();
    expect(within(gmail).getByText("Búsqueda automática: apagada")).toBeInTheDocument();
    expect(within(gmail).getByRole("button", { name: "Buscar en Gmail" })).toBeEnabled();
  });

  it("buscar en iCloud llama a su ruta y muestra el resultado en su tarjeta", async () => {
    withStatuses(icloudEnabled(), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    await userEvent.click(await icloudButton());
    const icloud = await card("iCloud");
    expect(await within(icloud).findByText("Revisé 3 mails nuevos: 1 importado · 1 ya estaba · 1 omitido")).toBeInTheDocument();
    expect(calls).toContainEqual({ url: "/api/mail/icloud/sync", method: "POST" });
    expect(within(icloud).getByText("resumen-icbc.pdf")).toBeInTheDocument();
    expect(within(icloud).getByText(`Tarjeta · ICBC · 64 movimientos · ${formatLocalDate(RECEIVED_AT)}`)).toBeInTheDocument();
    expect(within(icloud).queryByText("factura-luz.pdf")).not.toBeInTheDocument();
    expect(within(await card("Gmail")).queryByText(/^Revisé/)).not.toBeInTheDocument();
  });

  it("mientras busca el botón dice «Buscando…» y queda deshabilitado", async () => {
    let settle: (response: Response) => void = () => {};
    stubApi({
      status: () => respond([icloudEnabled(), GMAIL_ENABLED]),
      sync: () => new Promise<Response>((resolve) => {
        settle = resolve;
      }),
    });
    renderWithProviders(<MailImportSection />);
    await userEvent.click(await icloudButton());
    expect(await screen.findByRole("button", { name: "Buscando…" })).toBeDisabled();
    settle(respond(SYNC_RUN));
    expect(await icloudButton()).toBeEnabled();
  });

  it("si la búsqueda falla muestra el error del server", async () => {
    stubApi({
      status: () => respond([icloudEnabled(), GMAIL_ENABLED]),
      sync: () => respond({ error: "iCloud no está configurado: falta ICLOUD_USER" }, 409),
    });
    renderWithProviders(<MailImportSection />);
    await userEvent.click(await icloudButton());
    expect(await screen.findByText("iCloud no está configurado: falta ICLOUD_USER")).toBeInTheDocument();
  });

  it("los omitidos se ven al desplegarlos", async () => {
    withStatuses(icloudEnabled(SYNC_RUN), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    const toggle = await screen.findByRole("button", { name: "Ver omitidos (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(await screen.findByText("factura-luz.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar omitidos" })).toHaveAttribute("aria-expanded", "true");
  });

  it("una corrida con error muestra el motivo", async () => {
    const message = "iCloud rechazó el usuario o la contraseña de app. Generá una nueva en account.apple.com y actualizala en el Llavero (ledgerly-icloud-imap).";
    withStatuses(icloudEnabled(runOf({ trigger: "job", status: "error", error: message })), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText(/^Última búsqueda: .+ \(automática\)$/)).toBeInTheDocument();
  });

  it("si quedan mails por revisar lo avisa con el botón de su fuente", async () => {
    withStatuses(icloudEnabled(runOf({ messagesChecked: 50, hasMore: true, items: [item("a", "skipped")] })), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText("Quedan mails por revisar: tocá «Buscar en iCloud» otra vez.")).toBeInTheDocument();
  });

  it("en compu el botón no ocupa todo el ancho", async () => {
    withStatuses(icloudEnabled(), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    expect(await icloudButton()).not.toHaveClass("MuiButton-fullWidth");
  });

  it("en mobile el botón ocupa todo el ancho", async () => {
    emulateMobile();
    withStatuses(icloudEnabled(SYNC_RUN), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    expect(await icloudButton()).toHaveClass("MuiButton-fullWidth");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ver omitidos (1)" })).toBeInTheDocument());
  });
});
