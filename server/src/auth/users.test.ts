import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { UserModel } from "../db/models.js";
import { recordLogin } from "./users.js";

withDb();

const FIRST = new Date("2026-10-16T12:00:00.000Z");
const SECOND = new Date("2026-10-17T12:00:00.000Z");

describe("recordLogin", () => {
  it("el primer login crea al usuario con el mail en minúsculas", async () => {
    const { user, created } = await recordLogin(" Owner@Test.dev ", "Owner", FIRST);
    expect(created).toBe(true);
    expect(user.email).toBe("owner@test.dev");
    expect(user.name).toBe("Owner");
    expect(user.lastLoginAt).toEqual(FIRST);
  });

  it("el segundo login actualiza nombre y fecha sin duplicar", async () => {
    const first = await recordLogin("owner@test.dev", "Owner", FIRST);
    const second = await recordLogin("OWNER@test.dev", "Owner Nuevo", SECOND);
    expect(second.created).toBe(false);
    expect(second.user._id.equals(first.user._id)).toBe(true);
    expect(second.user.name).toBe("Owner Nuevo");
    expect(second.user.lastLoginAt).toEqual(SECOND);
    expect(await UserModel.countDocuments()).toBe(1);
  });
});
