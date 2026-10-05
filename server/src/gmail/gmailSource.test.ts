import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeGmailClient, pdfPart } from "../testing/mailFixtures.js";

vi.mock("./gmailClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./gmailClient.js")>()),
  createGmailClient: vi.fn(),
}));
import { createGmailClient } from "./gmailClient.js";
import { gmailMailClient, gmailSourceSetup } from "./gmailSource.js";

const CREDENTIALS = {
  GMAIL_CLIENT_ID: "id-sintetico", GMAIL_CLIENT_SECRET: "secreto-sintetico", GMAIL_REFRESH_TOKEN: "refresh-sintetico",
};

beforeEach(() => {
  vi.mocked(createGmailClient).mockReset();
});

describe("gmailMailClient", () => {
  it("lista con la consulta fija y delega lectura y descarga", async () => {
    const raw = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]);
    const client = gmailMailClient(raw, "from:banco has:attachment");
    expect(await client.listMessageIds(7)).toEqual(["msg-1"]);
    expect(raw.listMessageIds).toHaveBeenCalledWith("from:banco has:attachment", 7);
    const message = await client.getMessage("msg-1");
    await client.downloadPart("msg-1", message.pdfParts[0]);
    expect(raw.downloadPart).toHaveBeenCalledWith("msg-1", message.pdfParts[0]);
    await expect(client.close()).resolves.toBeUndefined();
  });
});

describe("gmailSourceSetup", () => {
  it("sin credenciales queda deshabilitada, con lo que falta y sin cliente", () => {
    expect(gmailSourceSetup({})).toEqual({
      source: "gmail", missing: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
      scope: null, schedule: null, openClient: null,
    });
  });

  it("con credenciales informa consulta y agenda, y crea el cliente recién al abrir", async () => {
    const raw = fakeGmailClient([]);
    vi.mocked(createGmailClient).mockReturnValue(raw);
    const setup = gmailSourceSetup({
      ...CREDENTIALS, GMAIL_QUERY: "from:banco has:attachment", MAIL_SYNC_DAYS: "25-5", MAIL_SYNC_HOUR: "9",
    });
    expect(setup).toMatchObject({ source: "gmail", missing: [], scope: "from:banco has:attachment",
      schedule: { fromDay: 25, toDay: 5, hour: 9 },
    });
    expect(createGmailClient).not.toHaveBeenCalled();
    const client = await setup.openClient?.();
    await client?.listMessageIds(3);
    expect(createGmailClient).toHaveBeenCalledWith({
      clientId: "id-sintetico", clientSecret: "secreto-sintetico", refreshToken: "refresh-sintetico",
    });
    expect(raw.listMessageIds).toHaveBeenCalledWith("from:banco has:attachment", 3);
  });
});
