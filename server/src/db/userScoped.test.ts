import { describe, it, expect } from "vitest";
import mongoose, { Schema, Types } from "mongoose";
import { withDb } from "../testing/withDb.js";
import { UnscopedQueryError, userScoped } from "./userScoped.js";

withDb();

const probeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  nombre: { type: String, required: true },
});
probeSchema.plugin(userScoped);
const ProbeModel = mongoose.models.UserScopedProbe ?? mongoose.model("UserScopedProbe", probeSchema);

const USER_ID = new Types.ObjectId();

const UNSCOPED = [
  ["find", () => ProbeModel.find({ nombre: "a" })],
  ["findOne", () => ProbeModel.findOne({ nombre: "a" })],
  ["findById", () => ProbeModel.findById(new Types.ObjectId())],
  ["findOneAndUpdate", () => ProbeModel.findOneAndUpdate({ nombre: "a" }, { nombre: "b" })],
  ["findOneAndDelete", () => ProbeModel.findOneAndDelete({ nombre: "a" })],
  ["countDocuments", () => ProbeModel.countDocuments({})],
  ["updateOne", () => ProbeModel.updateOne({ nombre: "a" }, { nombre: "b" })],
  ["updateMany", () => ProbeModel.updateMany({}, { nombre: "b" })],
  ["deleteOne", () => ProbeModel.deleteOne({ nombre: "a" })],
  ["deleteMany", () => ProbeModel.deleteMany({})],
  ["distinct", () => ProbeModel.distinct("nombre")],
  ["exists", () => ProbeModel.exists({ nombre: "a" })],
] as const;

describe("userScoped", () => {
  it.each(UNSCOPED)("%s sin userId tira UnscopedQueryError", async (_op, run) => {
    await expect(run()).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it("con userId en el filtro deja pasar", async () => {
    await ProbeModel.create({ userId: USER_ID, nombre: "a" });
    expect(await ProbeModel.countDocuments({ userId: USER_ID })).toBe(1);
    expect(await ProbeModel.findOne({ _id: { $exists: true }, userId: USER_ID })).not.toBeNull();
    expect(await ProbeModel.distinct("nombre", { userId: USER_ID })).toEqual(["a"]);
    expect((await ProbeModel.updateMany({ userId: { $exists: false } }, { userId: USER_ID })).modifiedCount).toBe(0);
  });

  it("aggregate sin $match inicial con userId tira", async () => {
    await expect(ProbeModel.aggregate([{ $group: { _id: "$nombre" } }])).rejects.toBeInstanceOf(UnscopedQueryError);
    await expect(ProbeModel.aggregate([{ $match: { nombre: "a" } }])).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it("aggregate con $match inicial con userId deja pasar", async () => {
    await ProbeModel.create({ userId: USER_ID, nombre: "a" });
    expect(await ProbeModel.aggregate([{ $match: { userId: USER_ID } }, { $count: "n" }])).toEqual([{ n: 1 }]);
  });

  it("insertar sin userId falla por validación", async () => {
    await expect(ProbeModel.create({ nombre: "a" })).rejects.toThrow(/userId/);
  });

  it("el mensaje nombra modelo y operación", async () => {
    await expect(ProbeModel.find({})).rejects.toThrow("Consulta sin userId sobre UserScopedProbe (find)");
  });
});
