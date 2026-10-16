import { describe, it, expect } from "vitest";
import request from "supertest";
import { withDb } from "../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OTHER_EMAIL, TEST_OWNER_EMAIL, withAuthedApi } from "../testing/auth.js";
import { FOREIGN_ORIGIN, OWNER_ONLY, SESSION_REQUIRED } from "../auth/requireUser.js";
import { createApp } from "./app.js";
import { withLocalServer } from "../testing/localServer.js";

withDb();
const app = createApp(TEST_AUTH_CONFIG);
const owner = withAuthedApi(app, TEST_OWNER_EMAIL);
const other = withAuthedApi(app, TEST_OTHER_EMAIL);
const local = withLocalServer(app);

describe("createApp", () => {
  it("GET /api/health responde ok sin sesión", async () => {
    const res = await request(local.server).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("sin sesión el resto de /api responde 401", async () => {
    const res = await request(local.server).get("/api/statements");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: SESSION_REQUIRED });
  });

  it("una ruta inexistente responde 404 con shape de error", async () => {
    const res = await owner.api.get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/auth/me devuelve al usuario de la sesión", async () => {
    const res = await owner.api.get("/api/auth/me");
    expect(res.body).toEqual({ email: TEST_OWNER_EMAIL, name: "owner", isOwner: true });
  });

  it("solo el owner entra a /api/mail", async () => {
    const res = await other.api.get("/api/mail/status");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: OWNER_ONLY });
  });

  it("el cron no pide sesión: sin su secreto responde su propio 401", async () => {
    const res = await request(local.server).get("/api/cron/mail/gmail");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "No autorizado" });
  });

  it("rechaza un POST desde otro origen", async () => {
    const res = await owner.api.post("/api/budgets").set("Origin", "https://otro.example").send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: FOREIGN_ORIGIN });
  });
});
