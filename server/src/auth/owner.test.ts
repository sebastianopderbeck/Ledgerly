import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { UserModel } from "../db/models.js";
import { MISSING_OWNER, MISSING_OWNER_EMAIL, findOwnerId, requireOwnerId } from "./owner.js";

withDb();

describe("owner", () => {
  it("findOwnerId devuelve null si no existe y el id si existe", async () => {
    expect(await findOwnerId("owner@test.dev")).toBeNull();
    const owner = await UserModel.create({ email: "owner@test.dev", name: "Owner" });
    expect((await findOwnerId(" OWNER@test.dev "))?.equals(owner._id)).toBe(true);
  });

  it("requireOwnerId pide OWNER_EMAIL", async () => {
    await expect(requireOwnerId({})).rejects.toThrow(MISSING_OWNER_EMAIL);
  });

  it("requireOwnerId pide correr la migración si el owner no existe", async () => {
    await expect(requireOwnerId({ OWNER_EMAIL: "owner@test.dev" })).rejects.toThrow(MISSING_OWNER);
  });

  it("requireOwnerId devuelve el id del owner", async () => {
    const owner = await UserModel.create({ email: "owner@test.dev", name: "Owner" });
    expect((await requireOwnerId({ OWNER_EMAIL: "owner@test.dev" })).equals(owner._id)).toBe(true);
  });
});
