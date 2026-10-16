import { Router, type CookieOptions } from "express";
import { createHash, randomBytes } from "node:crypto";
import type { MeDTO } from "@ledgerly/shared";
import { asyncHandler } from "../http/errors.js";
import { callbackUrl, isSecureOrigin, normalizeEmail, type AuthConfig } from "./authConfig.js";
import type { GoogleAuthClient, GoogleIdentity } from "./googleClient.js";
import { currentUser, requireUser } from "./requireUser.js";
import {
  OAUTH_COOKIE, OAUTH_COOKIE_PATH, OAUTH_MAX_AGE_MS, SESSION_COOKIE, SESSION_MAX_AGE_MS,
  signOAuthState, signSession, verifyOAuthState,
} from "./sessionToken.js";
import { recordLogin } from "./users.js";
import { seedCategoryRules } from "../rules/seedRules.js";

export interface AuthRouterDeps {
  config: AuthConfig;
  google: GoogleAuthClient;
}

export const LOGIN_NOT_ALLOWED_REDIRECT = "/?error=no-autorizado";
export const LOGIN_FAILED_REDIRECT = "/?error=login-fallido";

const randomToken = (): string => randomBytes(32).toString("base64url");

const challengeOf = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

export function createAuthRouter({ config, google }: AuthRouterDeps): Router {
  const router = Router();
  const cookieBase: CookieOptions = { httpOnly: true, sameSite: "lax", secure: isSecureOrigin(config) };
  const oauthCookie: CookieOptions = { ...cookieBase, path: OAUTH_COOKIE_PATH };
  const sessionCookie: CookieOptions = { ...cookieBase, path: "/" };
  const redirectUri = callbackUrl(config);

  const exchangeQuietly = (code: string, codeVerifier: string): Promise<GoogleIdentity | null> =>
    google.exchange({ code, codeVerifier, redirectUri }).catch(() => null);

  router.get("/google", asyncHandler(async (_req, res) => {
    const state = randomToken();
    const codeVerifier = randomToken();
    const token = await signOAuthState({ state, codeVerifier }, config.sessionSecret);
    res.cookie(OAUTH_COOKIE, token, { ...oauthCookie, maxAge: OAUTH_MAX_AGE_MS });
    res.redirect(google.authUrl({ state, codeChallenge: challengeOf(codeVerifier), redirectUri }));
  }));

  router.get("/google/callback", asyncHandler(async (req, res) => {
    const pending = await verifyOAuthState(req.cookies?.[OAUTH_COOKIE], config.sessionSecret);
    res.clearCookie(OAUTH_COOKIE, oauthCookie);
    const { code, state } = req.query;
    if (!pending || typeof code !== "string" || state !== pending.state) {
      res.redirect(LOGIN_FAILED_REDIRECT);
      return;
    }
    const identity = await exchangeQuietly(code, pending.codeVerifier);
    if (!identity?.emailVerified) {
      res.redirect(LOGIN_FAILED_REDIRECT);
      return;
    }
    const email = normalizeEmail(identity.email);
    if (!config.allowedEmails.has(email)) {
      res.redirect(LOGIN_NOT_ALLOWED_REDIRECT);
      return;
    }
    const { user, created } = await recordLogin(email, identity.name);
    if (created) await seedCategoryRules(user._id);
    const token = await signSession(user._id.toString(), config.sessionSecret);
    res.cookie(SESSION_COOKIE, token, { ...sessionCookie, maxAge: SESSION_MAX_AGE_MS });
    res.redirect("/");
  }));

  router.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, sessionCookie);
    res.status(204).end();
  });

  router.get("/me", requireUser(config), (req, res) => {
    const { email, name, isOwner } = currentUser(req);
    const body: MeDTO = { email, name, isOwner };
    res.json(body);
  });

  return router;
}
