import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { GMAIL_READONLY_SCOPE } from "./gmailConfig.js";
import { buildGmailAuthUrl, createPkcePair, exchangeGmailCode, upsertEnvVar } from "./authorizeGmail.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const exchangeInput = {
  clientId: "id-sintetico", clientSecret: "secreto-sintetico", code: "codigo-sintetico",
  redirectUri: "http://127.0.0.1:5555/oauth2callback", codeVerifier: "verifier-sintetico",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildGmailAuthUrl", () => {
  it("pide solo lectura, acceso offline, consentimiento y PKCE S256", () => {
    const url = new URL(buildGmailAuthUrl({
      clientId: "id-sintetico", redirectUri: "http://127.0.0.1:5555/oauth2callback", state: "estado", codeChallenge: "desafio",
    }));
    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "id-sintetico",
      redirect_uri: "http://127.0.0.1:5555/oauth2callback",
      response_type: "code",
      scope: GMAIL_READONLY_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state: "estado",
      code_challenge: "desafio",
      code_challenge_method: "S256",
    });
  });
});

describe("createPkcePair", () => {
  it("el challenge es el SHA-256 en base64url del verifier", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("genera un verifier distinto cada vez", () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
  });
});

describe("exchangeGmailCode", () => {
  it("manda el código con el verifier y devuelve el refresh token", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ access_token: "access-sintetico", refresh_token: "1//refresh-sintetico" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await exchangeGmailCode(exchangeInput)).toBe("1//refresh-sintetico");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      client_id: "id-sintetico",
      client_secret: "secreto-sintetico",
      code: "codigo-sintetico",
      code_verifier: "verifier-sintetico",
      redirect_uri: "http://127.0.0.1:5555/oauth2callback",
      grant_type: "authorization_code",
    });
  });

  it("falla con un mensaje claro si Google no devuelve refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ access_token: "access-sintetico" })));
    await expect(exchangeGmailCode(exchangeInput)).rejects.toThrow(
      "Google no devolvió refresh token; revocá el acceso de Ledgerly en tu cuenta y volvé a correr el script",
    );
  });

  it("falla con el status y el código de Google si rechaza el código, sin el secreto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_grant", error_description: "Bad Request" }, 400)));
    const error: unknown = await exchangeGmailCode(exchangeInput).catch((err: unknown) => err);
    const message = error instanceof Error ? error.message : "";
    expect(message).toBe("Google rechazó la autorización (400, invalid_grant).");
    expect(message).not.toContain("secreto-sintetico");
  });
});

describe("upsertEnvVar", () => {
  const ENV = "MONGO_URL=mongodb://localhost:27017/ledgerly\nGMAIL_CLIENT_ID=id\nGMAIL_REFRESH_TOKEN=\nPORT=4000\n";

  it("reemplaza la línea existente y conserva las demás", () => {
    expect(upsertEnvVar(ENV, "GMAIL_REFRESH_TOKEN", "1//nuevo")).toBe(
      "MONGO_URL=mongodb://localhost:27017/ledgerly\nGMAIL_CLIENT_ID=id\nGMAIL_REFRESH_TOKEN=1//nuevo\nPORT=4000\n",
    );
  });

  it("agrega la variable al final si no estaba", () => {
    expect(upsertEnvVar("A=1\n", "GMAIL_REFRESH_TOKEN", "x")).toBe("A=1\nGMAIL_REFRESH_TOKEN=x\n");
  });

  it("respeta un archivo sin salto final", () => {
    expect(upsertEnvVar("A=1", "GMAIL_REFRESH_TOKEN", "x")).toBe("A=1\nGMAIL_REFRESH_TOKEN=x");
  });

  it("en un archivo vacío deja solo la variable", () => {
    expect(upsertEnvVar("", "GMAIL_REFRESH_TOKEN", "x")).toBe("GMAIL_REFRESH_TOKEN=x\n");
  });

  it("no confunde otra variable que empieza igual ni un comentario", () => {
    const content = "GMAIL_REFRESH_TOKEN_VIEJO=a\n# GMAIL_REFRESH_TOKEN=comentado\n";
    expect(upsertEnvVar(content, "GMAIL_REFRESH_TOKEN", "x")).toBe(`${content}GMAIL_REFRESH_TOKEN=x\n`);
  });
});
