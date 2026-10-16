import type { Express } from "express";
import type { Server } from "node:http";
import type { Types } from "mongoose";
import request from "supertest";
import { beforeEach } from "vitest";
import type { AuthConfig } from "../auth/authConfig.js";
import { SESSION_COOKIE, signSession } from "../auth/sessionToken.js";
import { UserModel } from "../db/models.js";
import { withLocalServer } from "./localServer.js";

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

type Method = "get" | "post" | "put" | "patch" | "delete";

export type AuthedApi = Record<Method, (url: string) => request.Test>;

export interface AuthedSession {
  api: AuthedApi;
  userId: Types.ObjectId;
  cookie: string;
}

export const authedApi = (server: Server, cookie: string): AuthedApi => ({
  get: (url) => request(server).get(url).set("Cookie", cookie),
  post: (url) => request(server).post(url).set("Cookie", cookie),
  put: (url) => request(server).put(url).set("Cookie", cookie),
  patch: (url) => request(server).patch(url).set("Cookie", cookie),
  delete: (url) => request(server).delete(url).set("Cookie", cookie),
});

export function withAuthedApi(app: Express, email: string = TEST_OWNER_EMAIL): AuthedSession {
  const session = {} as AuthedSession;
  const local = withLocalServer(app);
  beforeEach(async () => {
    const user = await UserModel.create({ email, name: email.split("@")[0] });
    session.userId = user._id;
    session.cookie = await sessionCookieFor(user._id);
    session.api = authedApi(local.server, session.cookie);
  });
  return session;
}
