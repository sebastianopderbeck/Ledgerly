import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { withDb } from "../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OTHER_EMAIL, TEST_OWNER_EMAIL, sessionCookieFor } from "../testing/auth.js";
import { UserModel } from "../db/models.js";
import { errorMiddleware } from "../http/errors.js";
import { FOREIGN_ORIGIN, OWNER_ONLY, SESSION_REQUIRED, checkOrigin, currentUser, requireOwner, requireUser } from "./requireUser.js";

withDb();

const buildApp = () => {
  const app = express();
  app.use(cookieParser());
  app.use(checkOrigin(TEST_AUTH_CONFIG));
  app.get("/abierta", (_req, res) => { res.json({ ok: true }); });
  app.post("/abierta", (_req, res) => { res.json({ ok: true }); });
  app.use(requireUser(TEST_AUTH_CONFIG));
  app.get("/yo", (req, res) => {
    const { email, isOwner } = currentUser(req);
    res.json({ email, isOwner });
  });
  app.get("/solo-owner", requireOwner, (_req, res) => { res.json({ ok: true }); });
  app.use(errorMiddleware);
  return app;
};

const app = buildApp();

const cookieOf = async (email: string): Promise<string> => {
  const user = await UserModel.create({ email, name: "Prueba" });
  return sessionCookieFor(user._id);
};

describe("requireUser", () => {
  it("sin cookie responde 401", async () => {
    const res = await request(app).get("/yo");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: SESSION_REQUIRED });
  });

  it("con la cookie del owner deja pasar y marca isOwner", async () => {
    const res = await request(app).get("/yo").set("Cookie", await cookieOf(TEST_OWNER_EMAIL));
    expect(res.body).toEqual({ email: TEST_OWNER_EMAIL, isOwner: true });
  });

  it("con la cookie de otro usuario permitido, isOwner es false", async () => {
    const res = await request(app).get("/yo").set("Cookie", await cookieOf(TEST_OTHER_EMAIL));
    expect(res.body).toEqual({ email: TEST_OTHER_EMAIL, isOwner: false });
  });

  it("una cookie firmada con otro secret responde 401", async () => {
    const user = await UserModel.create({ email: TEST_OWNER_EMAIL, name: "Owner" });
    const cookie = await sessionCookieFor(user._id, { ...TEST_AUTH_CONFIG, sessionSecret: "otro-secreto-sintetico-de-prueba-xx" });
    expect((await request(app).get("/yo").set("Cookie", cookie)).status).toBe(401);
  });

  it("si el usuario ya no existe responde 401", async () => {
    const cookie = await cookieOf(TEST_OWNER_EMAIL);
    await UserModel.deleteMany({});
    expect((await request(app).get("/yo").set("Cookie", cookie)).status).toBe(401);
  });

  it("si el mail salió de la lista responde 401 aunque la cookie siga vigente", async () => {
    const res = await request(app).get("/yo").set("Cookie", await cookieOf("ex@test.dev"));
    expect(res.status).toBe(401);
  });
});

describe("requireOwner", () => {
  it("deja pasar al owner", async () => {
    const res = await request(app).get("/solo-owner").set("Cookie", await cookieOf(TEST_OWNER_EMAIL));
    expect(res.status).toBe(200);
  });

  it("a otro usuario le responde 403", async () => {
    const res = await request(app).get("/solo-owner").set("Cookie", await cookieOf(TEST_OTHER_EMAIL));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: OWNER_ONLY });
  });
});

describe("checkOrigin", () => {
  it("rechaza un POST con Origin ajeno", async () => {
    const res = await request(app).post("/abierta").set("Origin", "https://otro.example");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: FOREIGN_ORIGIN });
  });

  it("acepta un POST desde PUBLIC_URL o sin Origin", async () => {
    expect((await request(app).post("/abierta").set("Origin", TEST_AUTH_CONFIG.publicUrl)).status).toBe(200);
    expect((await request(app).post("/abierta")).status).toBe(200);
  });

  it("no mira el Origin de un GET", async () => {
    expect((await request(app).get("/abierta").set("Origin", "https://otro.example")).status).toBe(200);
  });
});
