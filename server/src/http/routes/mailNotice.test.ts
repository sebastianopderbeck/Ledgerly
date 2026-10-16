import { describe, it, expect } from "vitest";
import { withDb } from "../../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OTHER_EMAIL, withAuthedApi } from "../../testing/auth.js";
import { MailSyncRunModel, UserModel } from "../../db/models.js";
import { createApp } from "../app.js";

withDb();
const app = createApp(TEST_AUTH_CONFIG);
const owner = withAuthedApi(app);
const other = withAuthedApi(app, TEST_OTHER_EMAIL);

describe("/api/mail/notice", () => {
  it("con una corrida automática con error hay aviso, y al marcarlo visto se apaga", async () => {
    await MailSyncRunModel.create({
      userId: owner.userId, source: "icloud", trigger: "job", startedAt: new Date(Date.now() - 60_000), finishedAt: new Date(),
      status: "error", error: "iCloud rechazó la contraseña", messagesChecked: 0, hasMore: false,
    });
    expect((await owner.api.get("/api/mail/notice")).body).toEqual({ pending: true });
    expect((await owner.api.post("/api/mail/notice/seen")).status).toBe(204);
    expect((await owner.api.get("/api/mail/notice")).body).toEqual({ pending: false });
    expect((await UserModel.findById(owner.userId).lean())?.mailNoticeSeenAt).toBeInstanceOf(Date);
  });

  it("quien no es owner recibe 403", async () => {
    expect((await other.api.get("/api/mail/notice")).status).toBe(403);
    expect((await other.api.post("/api/mail/notice/seen")).status).toBe(403);
  });
});
