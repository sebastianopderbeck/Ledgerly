import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { mailSourceStatusDtoSchema, mailSyncRunDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { fakeGmailClient, fakeMailClient, pdfPart } from "../../testing/mailFixtures.js";

vi.mock("../../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
vi.mock("../../gmail/gmailClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../gmail/gmailClient.js")>()),
  createGmailClient: vi.fn(),
}));
vi.mock("../../icloud/keychain.js", () => ({ hasIcloudPassword: vi.fn(), readIcloudPassword: vi.fn() }));
vi.mock("../../icloud/icloudClient.js", () => ({ openIcloudClient: vi.fn() }));
import { extractPdfText } from "../../pdf/extract.js";
import { createGmailClient, GmailAuthError } from "../../gmail/gmailClient.js";
import { hasIcloudPassword, readIcloudPassword } from "../../icloud/keychain.js";
import { openIcloudClient } from "../../icloud/icloudClient.js";
import {
  IcloudAuthError, ICLOUD_AUTH_FAILED_MESSAGE, ICLOUD_MISSING_PASSWORD_MESSAGE,
} from "../../icloud/icloudErrors.js";
import { StatementModel } from "../../db/models.js";
import { createApp } from "../app.js";

withDb();
const app = createApp();
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const statementText = readFileSync(
  fileURLToPath(new URL("../../parsers/__fixtures__/icbc.sample.txt", import.meta.url)), "utf8",
);
const GMAIL_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
const ICLOUD_VARS = ["ICLOUD_USER", "ICLOUD_SINCE", "ICLOUD_MAILBOXES"];
const SCHEDULE_VARS = ["MAIL_SYNC_DAYS", "MAIL_SYNC_HOUR"];
const SECRETS = ["secreto-sintetico", "refresh-sintetico", "clave-app-sintetica"];
const ICLOUD_USER = "usuario-sintetico@icloud.com";

const enableGmail = (extra: Record<string, string> = {}) => {
  vi.stubEnv("GMAIL_CLIENT_ID", "id-sintetico");
  vi.stubEnv("GMAIL_CLIENT_SECRET", "secreto-sintetico");
  vi.stubEnv("GMAIL_REFRESH_TOKEN", "refresh-sintetico");
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
};

const enableIcloud = (extra: Record<string, string> = {}) => {
  vi.stubEnv("ICLOUD_USER", ICLOUD_USER);
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
  vi.mocked(hasIcloudPassword).mockResolvedValue(true);
  vi.mocked(readIcloudPassword).mockResolvedValue("clave-app-sintetica");
};

const statuses = async () => mailSourceStatusDtoSchema.array().parse((await request(app).get("/api/mail/status")).body);

beforeEach(() => {
  for (const key of [...GMAIL_VARS, "GMAIL_QUERY", ...SCHEDULE_VARS, ...ICLOUD_VARS]) vi.stubEnv(key, "");
  vi.mocked(createGmailClient).mockReset();
  vi.mocked(extractPdfText).mockReset();
  vi.mocked(hasIcloudPassword).mockReset();
  vi.mocked(hasIcloudPassword).mockResolvedValue(false);
  vi.mocked(readIcloudPassword).mockReset();
  vi.mocked(openIcloudClient).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/mail/status", () => {
  it("sin configurar informa las dos fuentes deshabilitadas, iCloud primero", async () => {
    const res = await request(app).get("/api/mail/status");
    expect(res.status).toBe(200);
    expect(mailSourceStatusDtoSchema.array().parse(res.body)).toEqual([
      { source: "icloud", enabled: false, missing: ["ICLOUD_USER"], scope: null, schedule: null, lastRun: null },
      { source: "gmail", enabled: false, missing: GMAIL_VARS, scope: null, schedule: null, lastRun: null },
    ]);
    expect(hasIcloudPassword).not.toHaveBeenCalled();
  });

  it("iCloud con cuenta pero sin contraseña en el Llavero dice qué falta", async () => {
    vi.stubEnv("ICLOUD_USER", ICLOUD_USER);
    const [icloud] = await statuses();
    expect(icloud).toMatchObject({ source: "icloud", enabled: false, missing: ["la contraseña de app en el Llavero"] });
    expect(hasIcloudPassword).toHaveBeenCalledWith(ICLOUD_USER);
  });

  it("habilitadas informan alcance y agenda sin leer ni exponer secretos", async () => {
    enableIcloud({ ICLOUD_SINCE: "2026-09-01", MAIL_SYNC_DAYS: "25-5", MAIL_SYNC_HOUR: "9" });
    enableGmail({ GMAIL_QUERY: "from:banco has:attachment" });
    const res = await request(app).get("/api/mail/status");
    const [icloud, gmail] = mailSourceStatusDtoSchema.array().parse(res.body);
    expect(icloud).toEqual({
      source: "icloud", enabled: true, missing: [], scope: "INBOX · desde el 01/09/2026",
      schedule: "todos los días a las 9 h, del 25 al 5", lastRun: null,
    });
    expect(gmail).toMatchObject({ source: "gmail", enabled: true, scope: "from:banco has:attachment",
      schedule: "todos los días a las 9 h, del 25 al 5",
    });
    expect(readIcloudPassword).not.toHaveBeenCalled();
    for (const secret of SECRETS) expect(JSON.stringify(res.body)).not.toContain(secret);
  });
});

describe("POST /api/mail/:source/sync", () => {
  it("una fuente desconocida responde 400", async () => {
    const res = await request(app).post("/api/mail/yahoo/sync");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Fuente de mails desconocida: yahoo");
  });

  it("Gmail sin credenciales responde 409 sin intentar conectarse", async () => {
    const res = await request(app).post("/api/mail/gmail/sync");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Gmail no está configurado: faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN");
    expect(createGmailClient).not.toHaveBeenCalled();
  });

  it("iCloud sin cuenta responde 409 en singular", async () => {
    const res = await request(app).post("/api/mail/icloud/sync");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("iCloud no está configurado: falta ICLOUD_USER");
    expect(openIcloudClient).not.toHaveBeenCalled();
  });

  it("iCloud con cuenta y sin contraseña responde 409 sin abrir el cliente", async () => {
    vi.stubEnv("ICLOUD_USER", ICLOUD_USER);
    const res = await request(app).post("/api/mail/icloud/sync");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("iCloud no está configurado: falta la contraseña de app en el Llavero");
    expect(openIcloudClient).not.toHaveBeenCalled();
  });

  it("iCloud importa el resumen de un mail con la contraseña del Llavero y queda en su status", async () => {
    enableIcloud({ ICLOUD_SINCE: "2026-09-01", ICLOUD_MAILBOXES: "INBOX, Bancos" });
    vi.mocked(extractPdfText).mockResolvedValue({ text: statementText, meta });
    vi.mocked(openIcloudClient).mockResolvedValue(fakeMailClient([{
      id: "resumen@banco.example",
      pdfParts: [{ kind: "attachment", partId: "2", fileName: "resumen-sintetico.pdf", size: 2048, mailbox: "INBOX", uid: 11 }],
    }]));
    const res = await request(app).post("/api/mail/icloud/sync");
    expect(res.status).toBe(200);
    const run = mailSyncRunDtoSchema.parse(res.body);
    expect(run).toMatchObject({ source: "icloud", trigger: "manual", status: "ok", messagesChecked: 1 });
    expect(run.items).toMatchObject([{ fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement" }]);
    expect(openIcloudClient).toHaveBeenCalledWith({
      user: ICLOUD_USER, password: "clave-app-sintetica", mailboxes: ["INBOX", "Bancos"], since: new Date(2026, 8, 1),
    });
    expect(await StatementModel.countDocuments()).toBe(1);
    const [icloud, gmail] = await statuses();
    expect(icloud.lastRun).toEqual(res.body);
    expect(gmail.lastRun).toBeNull();
  });

  it("si iCloud rechaza el login responde 200 con la corrida en error", async () => {
    enableIcloud();
    vi.mocked(openIcloudClient).mockRejectedValue(new IcloudAuthError(ICLOUD_AUTH_FAILED_MESSAGE));
    const res = await request(app).post("/api/mail/icloud/sync");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: "icloud", status: "error", error: ICLOUD_AUTH_FAILED_MESSAGE });
  });

  it("si la contraseña desaparece del Llavero, la corrida queda en error con los pasos", async () => {
    enableIcloud();
    vi.mocked(readIcloudPassword).mockRejectedValue(new IcloudAuthError(ICLOUD_MISSING_PASSWORD_MESSAGE));
    const res = await request(app).post("/api/mail/icloud/sync");
    expect(res.body).toMatchObject({ status: "error", error: ICLOUD_MISSING_PASSWORD_MESSAGE });
    expect(openIcloudClient).not.toHaveBeenCalled();
  });

  it("Gmail importa el resumen de un mail y después el status trae la corrida", async () => {
    enableGmail();
    vi.mocked(extractPdfText).mockResolvedValue({ text: statementText, meta });
    vi.mocked(createGmailClient).mockReturnValue(
      fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]),
    );
    const res = await request(app).post("/api/mail/gmail/sync");
    expect(res.status).toBe(200);
    const run = mailSyncRunDtoSchema.parse(res.body);
    expect(run).toMatchObject({ source: "gmail", trigger: "manual", status: "ok", messagesChecked: 1 });
    expect(run.items).toMatchObject([{ fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement" }]);
    expect(run.items[0].documentId).toBe((await StatementModel.findOne())?._id.toString());
    const [, gmail] = await statuses();
    expect(gmail.lastRun).toEqual(res.body);
  });

  it("un token de Gmail rechazado responde 200 con la corrida en error", async () => {
    enableGmail();
    const client = fakeGmailClient([]);
    client.listMessageIds.mockRejectedValue(new GmailAuthError("Gmail rechazó el refresh token (venció o fue revocado)."));
    vi.mocked(createGmailClient).mockReturnValue(client);
    const res = await request(app).post("/api/mail/gmail/sync");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "error", error: "Gmail rechazó el refresh token (venció o fue revocado)." });
  });
});
