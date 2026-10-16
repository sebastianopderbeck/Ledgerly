import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { withDb } from "../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OWNER_EMAIL } from "../testing/auth.js";
import { UserModel } from "../db/models.js";
import { errorMiddleware } from "../http/errors.js";
import type { AuthConfig } from "./authConfig.js";
import type { GoogleAuthUrlInput, GoogleExchangeInput, GoogleIdentity } from "./googleClient.js";
import { LOGIN_FAILED_REDIRECT, LOGIN_NOT_ALLOWED_REDIRECT, createAuthRouter } from "./authRouter.js";
import { OAUTH_COOKIE, SESSION_COOKIE, verifyOAuthState, verifySession } from "./sessionToken.js";

withDb();

const OWNER: GoogleIdentity = { email: TEST_OWNER_EMAIL, emailVerified: true, name: "Owner" };
const REDIRECT_URI = "http://localhost:5173/api/auth/google/callback";

const fakeGoogle = (result: GoogleIdentity | Error) => {
  const authUrl = vi.fn(({ state, codeChallenge, redirectUri }: GoogleAuthUrlInput): string => {
    const url = new URL("https://accounts.google.test/auth");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("redirect_uri", redirectUri);
    return url.toString();
  });
  const exchange = vi.fn(async (_input: GoogleExchangeInput): Promise<GoogleIdentity> => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { authUrl, exchange };
};

const buildApp = (google: ReturnType<typeof fakeGoogle>, config: AuthConfig = TEST_AUTH_CONFIG): Express => {
  const app = express();
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter({ config, google }));
  app.use(errorMiddleware);
  return app;
};

const setCookies = (headers: Record<string, unknown>): string[] => {
  const raw = headers["set-cookie"];
  return Array.isArray(raw) ? raw.map(String) : [];
};

const cookieHeader = (headers: Record<string, unknown>, name: string): string =>
  setCookies(headers).find((cookie) => cookie.startsWith(`${name}=`)) ?? "";

const cookiePair = (headers: Record<string, unknown>, name: string): string => cookieHeader(headers, name).split(";")[0];

const login = async (app: Express, stateOverride?: string) => {
  const start = await request(app).get("/api/auth/google");
  const oauthCookie = cookiePair(start.headers, OAUTH_COOKIE);
  const state = stateOverride ?? new URL(String(start.headers.location)).searchParams.get("state") ?? "";
  const callback = await request(app)
    .get(`/api/auth/google/callback?code=codigo-sintetico&state=${state}`)
    .set("Cookie", oauthCookie);
  return { start, oauthCookie, callback };
};

describe("GET /api/auth/google", () => {
  it("redirige a Google con state, PKCE S256 y la redirect URI, y guarda el state en una cookie corta", async () => {
    const google = fakeGoogle(OWNER);
    const start = await request(buildApp(google)).get("/api/auth/google");
    expect(start.status).toBe(302);
    const header = cookieHeader(start.headers, OAUTH_COOKIE);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/api/auth");
    expect(header).toContain("Max-Age=600");
    const pending = await verifyOAuthState(cookiePair(start.headers, OAUTH_COOKIE).split("=")[1], TEST_AUTH_CONFIG.sessionSecret);
    const { state, codeChallenge, redirectUri } = google.authUrl.mock.calls[0][0];
    expect(state).toBe(pending?.state);
    expect(codeChallenge).toBe(createHash("sha256").update(pending?.codeVerifier ?? "").digest("base64url"));
    expect(redirectUri).toBe(REDIRECT_URI);
  });
});

describe("GET /api/auth/google/callback", () => {
  it("crea al usuario, setea la sesión de 30 días y redirige a /", async () => {
    const google = fakeGoogle(OWNER);
    const { callback, oauthCookie } = await login(buildApp(google));
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("/");
    const session = cookieHeader(callback.headers, SESSION_COOKIE);
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Lax");
    expect(session).toContain("Path=/");
    expect(session).toContain("Max-Age=2592000");
    expect(session).not.toContain("Secure");
    const user = await UserModel.findOne({ email: TEST_OWNER_EMAIL });
    const token = cookiePair(callback.headers, SESSION_COOKIE).split("=")[1];
    expect(await verifySession(token, TEST_AUTH_CONFIG.sessionSecret)).toBe(user?._id.toString());
    const pending = await verifyOAuthState(oauthCookie.split("=")[1], TEST_AUTH_CONFIG.sessionSecret);
    expect(google.exchange).toHaveBeenCalledWith({
      code: "codigo-sintetico", codeVerifier: pending?.codeVerifier, redirectUri: REDIRECT_URI,
    });
  });

  it("borra la cookie de OAuth para que el state no se pueda reusar", async () => {
    const { callback } = await login(buildApp(fakeGoogle(OWNER)));
    expect(cookieHeader(callback.headers, OAUTH_COOKIE)).toMatch(/^ledgerly_oauth=;.*Expires=Thu, 01 Jan 1970/);
  });

  it("con PUBLIC_URL https la cookie de sesión lleva Secure", async () => {
    const config = { ...TEST_AUTH_CONFIG, publicUrl: "https://ledger.example.ts.net" };
    const { callback } = await login(buildApp(fakeGoogle(OWNER), config));
    expect(cookieHeader(callback.headers, SESSION_COOKIE)).toContain("Secure");
  });

  it("acepta el mail con mayúsculas y espacios y lo guarda normalizado", async () => {
    const { callback } = await login(buildApp(fakeGoogle({ ...OWNER, email: " OWNER@Test.Dev " })));
    expect(callback.headers.location).toBe("/");
    expect(await UserModel.countDocuments({ email: TEST_OWNER_EMAIL })).toBe(1);
  });

  it("un mail fuera de la lista no crea usuario ni sesión", async () => {
    const { callback } = await login(buildApp(fakeGoogle({ ...OWNER, email: "intruso@test.dev" })));
    expect(callback.headers.location).toBe(LOGIN_NOT_ALLOWED_REDIRECT);
    expect(cookieHeader(callback.headers, SESSION_COOKIE)).toBe("");
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("un mail sin verificar es login fallido", async () => {
    const { callback } = await login(buildApp(fakeGoogle({ ...OWNER, emailVerified: false })));
    expect(callback.headers.location).toBe(LOGIN_FAILED_REDIRECT);
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("un state distinto es login fallido y no canjea el código", async () => {
    const google = fakeGoogle(OWNER);
    const { callback } = await login(buildApp(google), "otro-state");
    expect(callback.headers.location).toBe(LOGIN_FAILED_REDIRECT);
    expect(google.exchange).not.toHaveBeenCalled();
    expect(cookieHeader(callback.headers, OAUTH_COOKIE)).toMatch(/^ledgerly_oauth=;/);
  });

  it("sin cookie de OAuth es login fallido", async () => {
    const res = await request(buildApp(fakeGoogle(OWNER))).get("/api/auth/google/callback?code=x&state=y");
    expect(res.headers.location).toBe(LOGIN_FAILED_REDIRECT);
  });

  it("si Google falla al canjear es login fallido", async () => {
    const { callback } = await login(buildApp(fakeGoogle(new Error("Google caído"))));
    expect(callback.headers.location).toBe(LOGIN_FAILED_REDIRECT);
  });
});

describe("GET /api/auth/me y POST /api/auth/logout", () => {
  it("me devuelve al usuario de la sesión", async () => {
    const app = buildApp(fakeGoogle(OWNER));
    const { callback } = await login(app);
    const res = await request(app).get("/api/auth/me").set("Cookie", cookiePair(callback.headers, SESSION_COOKIE));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: TEST_OWNER_EMAIL, name: "Owner", isOwner: true });
  });

  it("me sin sesión responde 401", async () => {
    expect((await request(buildApp(fakeGoogle(OWNER))).get("/api/auth/me")).status).toBe(401);
  });

  it("logout borra la cookie de sesión", async () => {
    const res = await request(buildApp(fakeGoogle(OWNER))).post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(cookieHeader(res.headers, SESSION_COOKIE)).toMatch(/^ledgerly_session=;.*Expires=Thu, 01 Jan 1970/);
  });
});
