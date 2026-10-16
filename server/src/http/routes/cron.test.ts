import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Types } from "mongoose";
import type { MailSyncRunDTO } from "@ledgerly/shared";

vi.mock("../../mail/mailSources.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mail/mailSources.js")>()),
  readMailSourceSetup: vi.fn(),
}));
vi.mock("../../mail/syncMail.js", () => ({ runMailSync: vi.fn() }));
import { readMailSourceSetup } from "../../mail/mailSources.js";
import { runMailSync } from "../../mail/syncMail.js";
import { withDb } from "../../testing/withDb.js";
import { withLocalServers } from "../../testing/localServer.js";
import { UserModel } from "../../db/models.js";
import { MISSING_OWNER } from "../../auth/owner.js";
import { errorMiddleware } from "../errors.js";
import { CRON_UNAUTHORIZED, OUT_OF_SCHEDULE, createCronRouter } from "./cron.js";

withDb();
const serve = withLocalServers();

const SECRET = "secreto-de-cron-sintetico-de-32-caracteres";
const OWNER_EMAIL = "owner@test.dev";
const INSIDE = new Date("2026-10-26T00:30:00Z");
const OUTSIDE = new Date("2026-10-25T00:30:00Z");
const openClient = vi.fn();
const RUN: MailSyncRunDTO = {
  source: "icloud", trigger: "job", startedAt: "2026-10-26T00:30:00.000Z", finishedAt: "2026-10-26T00:30:05.000Z",
  status: "ok", error: null, messagesChecked: 0, hasMore: false, items: [],
};

const call = async (now: Date, env: NodeJS.ProcessEnv, auth?: string, source = "icloud") => {
  const app = express();
  app.use("/api/cron", createCronRouter({ env, ownerEmail: OWNER_EMAIL, now: () => now }));
  app.use(errorMiddleware);
  const req = request(await serve(app)).get(`/api/cron/mail/${source}`);
  return auth === undefined ? req : req.set("Authorization", auth);
};

const ENV = { CRON_SECRET: SECRET, MAIL_SYNC_DAYS: "25-5" };
const BEARER = `Bearer ${SECRET}`;

beforeEach(() => {
  vi.mocked(readMailSourceSetup).mockReset();
  vi.mocked(runMailSync).mockReset();
  vi.mocked(readMailSourceSetup).mockResolvedValue({ source: "icloud", missing: [], scope: "INBOX", schedule: null, openClient });
  vi.mocked(runMailSync).mockResolvedValue(RUN);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("GET /api/cron/mail/:source", () => {
  it("sin Authorization responde 401", async () => {
    const res = await call(INSIDE, ENV);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: CRON_UNAUTHORIZED });
  });

  it("con otro secreto responde 401", async () => {
    expect((await call(INSIDE, ENV, "Bearer otro")).status).toBe(401);
  });

  it("sin CRON_SECRET en el entorno rechaza todo, aun un Bearer vacío", async () => {
    expect((await call(INSIDE, { MAIL_SYNC_DAYS: "25-5" }, "Bearer ")).status).toBe(401);
    expect((await call(INSIDE, { MAIL_SYNC_DAYS: "25-5" }, "Bearer undefined")).status).toBe(401);
  });

  it("una fuente desconocida responde 400", async () => {
    expect((await call(INSIDE, ENV, BEARER, "hotmail")).status).toBe(400);
  });

  it("fuera de agenda en hora de Argentina no corre", async () => {
    const res = await call(OUTSIDE, ENV, BEARER);
    expect(res.body).toEqual({ skipped: OUT_OF_SCHEDULE });
    expect(runMailSync).not.toHaveBeenCalled();
  });

  it("sin MAIL_SYNC_DAYS no corre", async () => {
    expect((await call(INSIDE, { CRON_SECRET: SECRET }, BEARER)).body).toEqual({ skipped: OUT_OF_SCHEDULE });
  });

  it("sin usuario owner no corre y lo avisa", async () => {
    const res = await call(INSIDE, ENV, BEARER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ skipped: MISSING_OWNER });
    expect(runMailSync).not.toHaveBeenCalled();
  });

  it("con la fuente sin configurar no corre y dice qué falta", async () => {
    await UserModel.create({ email: OWNER_EMAIL, name: "Owner" });
    vi.mocked(readMailSourceSetup).mockResolvedValue({ source: "icloud", missing: ["ICLOUD_USER"], scope: null, schedule: null, openClient: null });
    const res = await call(INSIDE, ENV, BEARER);
    expect(res.body).toEqual({ skipped: "iCloud no está configurado: falta ICLOUD_USER" });
    expect(runMailSync).not.toHaveBeenCalled();
  });

  it("adentro de la agenda corre como owner y devuelve la corrida", async () => {
    const owner = await UserModel.create({ email: OWNER_EMAIL, name: "Owner" });
    const res = await call(INSIDE, ENV, BEARER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(RUN);
    const [ownerId, source, client, trigger] = vi.mocked(runMailSync).mock.calls[0];
    expect((ownerId as Types.ObjectId).equals(owner._id)).toBe(true);
    expect([source, client, trigger]).toEqual(["icloud", openClient, "job"]);
  });
});
