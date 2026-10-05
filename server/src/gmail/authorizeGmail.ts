import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { GMAIL_READONLY_SCOPE } from "./gmailConfig.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const LOOPBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/oauth2callback";
const AUTH_TIMEOUT_MS = 5 * 60_000;
const REFRESH_TOKEN_VAR = "GMAIL_REFRESH_TOKEN";
const ENV_FILE_MODE = 0o600;
const PAGE_HEADERS = { "Content-Type": "text/html; charset=utf-8" };
const NO_REFRESH_TOKEN_MESSAGE =
  "Google no devolvió refresh token; revocá el acceso de Ledgerly en tu cuenta y volvé a correr el script";

interface PkcePair {
  verifier: string;
  challenge: string;
}

interface GmailAuthUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

interface GmailCodeExchangeInput {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

interface TokenExchangeResponse {
  refresh_token?: string;
  error?: string;
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildGmailAuthUrl({ clientId, redirectUri, state, codeChallenge }: GmailAuthUrlInput): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGmailCode({
  clientId, clientSecret, code, redirectUri, codeVerifier,
}: GmailCodeExchangeInput): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await response.json().catch(() => null)) as TokenExchangeResponse | null;
  if (!response.ok) {
    const googleCode = body?.error ? `, ${body.error}` : "";
    throw new Error(`Google rechazó la autorización (${response.status}${googleCode}).`);
  }
  if (!body?.refresh_token) throw new Error(NO_REFRESH_TOKEN_MESSAGE);
  return body.refresh_token;
}

export function upsertEnvVar(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const lines = content.split("\n");
  const index = lines.findIndex((current) => current.trimStart().startsWith(`${key}=`));
  if (index >= 0) return lines.map((current, position) => (position === index ? line : current)).join("\n");
  if (content === "") return `${line}\n`;
  return content.endsWith("\n") ? `${content}${line}\n` : `${content}\n${line}`;
}

const page = (message: string): string =>
  `<!doctype html><meta charset="utf-8"><title>Ledgerly</title><p style="font-family:system-ui;margin:2rem">${message}</p>`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const listenOnLoopback = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, LOOPBACK_HOST, () => resolve((server.address() as AddressInfo).port));
  });

const waitForAuthorizationCode = (server: Server, state: string): Promise<string> =>
  new Promise((resolve, reject) => {
    server.on("request", (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`);
      if (url.pathname !== CALLBACK_PATH || url.searchParams.get("state") !== state) {
        res.writeHead(404, PAGE_HEADERS).end(page("No encontrado."));
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(200, PAGE_HEADERS).end(page("Cancelaste la autorización. Ya podés cerrar esta pestaña."));
        const denied = url.searchParams.get("error") === "access_denied";
        reject(new Error(denied ? "Cancelaste la autorización." : "Google no devolvió un código de autorización."));
        return;
      }
      res.writeHead(200, PAGE_HEADERS).end(page("Listo, ya podés cerrar esta pestaña."));
      resolve(code);
    });
  });

const saveRefreshToken = (refreshToken: string): void => {
  const envPath = join(process.cwd(), ".env");
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  writeFileSync(envPath, upsertEnvVar(current, REFRESH_TOKEN_VAR, refreshToken), { mode: ENV_FILE_MODE });
};

const authorizeGmail = async (): Promise<void> => {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) fail("Primero cargá GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en .env (ver README).");

  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString("hex");
  const server = createServer();
  const port = await listenOnLoopback(server);
  const redirectUri = `http://${LOOPBACK_HOST}:${port}${CALLBACK_PATH}`;
  const timeout = setTimeout(() => fail("Se venció la espera."), AUTH_TIMEOUT_MS);
  const authUrl = buildGmailAuthUrl({ clientId, redirectUri, state, codeChallenge: challenge });
  console.log(`Abrí este link y autorizá a Ledgerly (solo lectura): ${authUrl}`);

  try {
    const code = await waitForAuthorizationCode(server, state);
    const refreshToken = await exchangeGmailCode({ clientId, clientSecret, code, redirectUri, codeVerifier: verifier });
    saveRefreshToken(refreshToken);
    console.log("Listo: guardé GMAIL_REFRESH_TOKEN en .env. Reiniciá el server para que lo tome.");
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
    server.closeAllConnections();
    server.close();
  }
};

if (process.argv[1]?.endsWith("authorizeGmail.ts")) {
  await authorizeGmail();
}
