import { describe, it, expect } from "vitest";
import {
  OAUTH_MAX_AGE_MS, SESSION_MAX_AGE_MS, signOAuthState, signSession, verifyOAuthState, verifySession,
} from "./sessionToken.js";

const SECRET = "s".repeat(32);
const OTHER_SECRET = "o".repeat(32);
const SIGNED_AT = new Date("2026-10-16T12:00:00.000Z");
const after = (ms: number): Date => new Date(SIGNED_AT.getTime() + ms);
const tamper = (token: string): string => token.replace(/.$/, (last) => (last === "A" ? "B" : "A"));

describe("sesión", () => {
  it("firma y verifica el id del usuario", async () => {
    const token = await signSession("user-1", SECRET, SIGNED_AT);
    expect(await verifySession(token, SECRET, after(1000))).toBe("user-1");
  });

  it("vale hasta el día 30 y después no", async () => {
    const token = await signSession("user-1", SECRET, SIGNED_AT);
    expect(await verifySession(token, SECRET, after(SESSION_MAX_AGE_MS - 1000))).toBe("user-1");
    expect(await verifySession(token, SECRET, after(SESSION_MAX_AGE_MS + 1000))).toBeNull();
  });

  it("no vale firmada con otro secret ni alterada", async () => {
    const token = await signSession("user-1", SECRET, SIGNED_AT);
    expect(await verifySession(token, OTHER_SECRET, after(1000))).toBeNull();
    expect(await verifySession(tamper(token), SECRET, after(1000))).toBeNull();
  });

  it("sin cookie no hay sesión", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession("", SECRET)).toBeNull();
  });
});

describe("estado de OAuth", () => {
  const STATE = { state: "estado-sintetico", codeVerifier: "verificador-sintetico" };

  it("firma y verifica state y code_verifier", async () => {
    const token = await signOAuthState(STATE, SECRET, SIGNED_AT);
    expect(await verifyOAuthState(token, SECRET, after(1000))).toEqual(STATE);
  });

  it("vence a los 10 minutos", async () => {
    const token = await signOAuthState(STATE, SECRET, SIGNED_AT);
    expect(await verifyOAuthState(token, SECRET, after(OAUTH_MAX_AGE_MS + 1000))).toBeNull();
  });

  it("un token no sirve como el otro", async () => {
    const oauth = await signOAuthState(STATE, SECRET, SIGNED_AT);
    const session = await signSession("user-1", SECRET, SIGNED_AT);
    expect(await verifySession(oauth, SECRET, after(1000))).toBeNull();
    expect(await verifyOAuthState(session, SECRET, after(1000))).toBeNull();
  });
});
