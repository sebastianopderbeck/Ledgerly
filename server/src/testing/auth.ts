import type { Types } from "mongoose";
import type { AuthConfig } from "../auth/authConfig.js";
import { SESSION_COOKIE, signSession } from "../auth/sessionToken.js";

export const TEST_OWNER_EMAIL = "owner@test.dev";
export const TEST_OTHER_EMAIL = "otra@test.dev";

export const TEST_AUTH_CONFIG: AuthConfig = {
  googleClientId: "client-id-sintetico",
  googleClientSecret: "client-secret-sintetico",
  sessionSecret: "secreto-de-sesion-sintetico-de-prueba",
  ownerEmail: TEST_OWNER_EMAIL,
  allowedEmails: new Set([TEST_OWNER_EMAIL, TEST_OTHER_EMAIL]),
  publicUrl: "http://localhost:5173",
};

const TEST_SESSION_ISSUED_AT = new Date("2099-01-01T00:00:00.000Z");

export const sessionCookieFor = async (userId: Types.ObjectId, config: AuthConfig = TEST_AUTH_CONFIG): Promise<string> =>
  `${SESSION_COOKIE}=${await signSession(userId.toString(), config.sessionSecret, TEST_SESSION_ISSUED_AT)}`;
