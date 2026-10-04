import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { gmailStatusDtoSchema, gmailSyncRunDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { fakeGmailClient, pdfPart } from "../../testing/gmailFixtures.js";

vi.mock("../../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
vi.mock("../../gmail/gmailClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../gmail/gmailClient.js")>()),
  createGmailClient: vi.fn(),
}));
import { extractPdfText } from "../../pdf/extract.js";
import { createGmailClient, GmailAuthError } from "../../gmail/gmailClient.js";
import { StatementModel } from "../../db/models.js";
import { createApp } from "../app.js";

withDb();
const app = createApp();
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const statementText = readFileSync(
  fileURLToPath(new URL("../../parsers/__fixtures__/icbc.sample.txt", import.meta.url)), "utf8",
);
const CREDENTIAL_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
const SECRETS = ["secreto-sintetico", "refresh-sintetico"];

const enableGmail = (extra: Record<string, string> = {}) => {
  vi.stubEnv("GMAIL_CLIENT_ID", "id-sintetico");
  vi.stubEnv("GMAIL_CLIENT_SECRET", "secreto-sintetico");
  vi.stubEnv("GMAIL_REFRESH_TOKEN", "refresh-sintetico");
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
};

beforeEach(() => {
  for (const key of [...CREDENTIAL_VARS, "GMAIL_QUERY", "GMAIL_SYNC_INTERVAL_MINUTES"]) vi.stubEnv(key, "");
  vi.mocked(createGmailClient).mockReset();
  vi.mocked(extractPdfText).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/gmail/status", () => {
  it("sin credenciales informa deshabilitado y qué variables faltan", async () => {
    const res = await request(app).get("/api/gmail/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, missing: CREDENTIAL_VARS, query: null, intervalMinutes: null, lastRun: null });
    expect(() => gmailStatusDtoSchema.parse(res.body)).not.toThrow();
  });

  it("con credenciales informa la consulta y el intervalo, sin exponer secretos", async () => {
    enableGmail({ GMAIL_SYNC_INTERVAL_MINUTES: "360" });
    const res = await request(app).get("/api/gmail/status");
    expect(res.body).toEqual({
      enabled: true, missing: [], query: "has:attachment filename:pdf newer_than:90d", intervalMinutes: 360, lastRun: null,
    });
    for (const secret of SECRETS) expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it("un intervalo inválido queda como búsqueda automática apagada", async () => {
    enableGmail({ GMAIL_SYNC_INTERVAL_MINUTES: "5", GMAIL_QUERY: "from:banco has:attachment" });
    const res = await request(app).get("/api/gmail/status");
    expect(res.body).toMatchObject({ enabled: true, query: "from:banco has:attachment", intervalMinutes: null });
  });
});

describe("POST /api/gmail/sync", () => {
  it("sin credenciales responde 409 sin intentar conectarse", async () => {
    const res = await request(app).post("/api/gmail/sync");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Gmail no está configurado: faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN");
    expect(createGmailClient).not.toHaveBeenCalled();
  });

  it("importa el resumen de un mail y después el status trae la corrida", async () => {
    enableGmail();
    vi.mocked(extractPdfText).mockResolvedValue({ text: statementText, meta });
    vi.mocked(createGmailClient).mockReturnValue(
      fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]),
    );
    const res = await request(app).post("/api/gmail/sync");
    expect(res.status).toBe(200);
    const run = gmailSyncRunDtoSchema.parse(res.body);
    expect(run).toMatchObject({ trigger: "manual", status: "ok", messagesChecked: 1 });
    expect(run.items).toMatchObject([{ fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement" }]);
    expect(await StatementModel.countDocuments()).toBe(1);
    expect(run.items[0].documentId).toBe((await StatementModel.findOne())?._id.toString());

    const status = await request(app).get("/api/gmail/status");
    expect(status.body.lastRun).toEqual(res.body);
  });

  it("un token rechazado responde 200 con la corrida en error", async () => {
    enableGmail();
    const client = fakeGmailClient([]);
    client.listMessageIds.mockRejectedValue(new GmailAuthError("Gmail rechazó el refresh token (venció o fue revocado)."));
    vi.mocked(createGmailClient).mockReturnValue(client);
    const res = await request(app).post("/api/gmail/sync");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "error", error: "Gmail rechazó el refresh token (venció o fue revocado)." });
  });
});
