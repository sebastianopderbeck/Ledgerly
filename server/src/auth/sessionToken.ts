import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ledgerly_session";
export const OAUTH_COOKIE = "ledgerly_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth";
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

export interface OAuthState {
  state: string;
  codeVerifier: string;
}

const ALGORITHM = "HS256";

const keyOf = (secret: string): Uint8Array => new TextEncoder().encode(secret);

const epochSeconds = (ms: number): number => Math.floor(ms / 1000);

const sign = (claims: Record<string, string>, secret: string, maxAgeMs: number, now: Date): Promise<string> =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt(epochSeconds(now.getTime()))
    .setExpirationTime(epochSeconds(now.getTime() + maxAgeMs))
    .sign(keyOf(secret));

const verify = async (token: unknown, secret: string, now: Date): Promise<Record<string, unknown> | null> => {
  if (typeof token !== "string" || token === "") return null;
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), { algorithms: [ALGORITHM], currentDate: now });
    return payload;
  } catch {
    return null;
  }
};

export const signSession = (userId: string, secret: string, now: Date = new Date()): Promise<string> =>
  sign({ sub: userId }, secret, SESSION_MAX_AGE_MS, now);

export async function verifySession(token: unknown, secret: string, now: Date = new Date()): Promise<string | null> {
  const payload = await verify(token, secret, now);
  return typeof payload?.sub === "string" ? payload.sub : null;
}

export const signOAuthState = ({ state, codeVerifier }: OAuthState, secret: string, now: Date = new Date()): Promise<string> =>
  sign({ state, codeVerifier }, secret, OAUTH_MAX_AGE_MS, now);

export async function verifyOAuthState(token: unknown, secret: string, now: Date = new Date()): Promise<OAuthState | null> {
  const payload = await verify(token, secret, now);
  const state = payload?.state;
  const codeVerifier = payload?.codeVerifier;
  return typeof state === "string" && typeof codeVerifier === "string" ? { state, codeVerifier } : null;
}
