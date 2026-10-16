import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { EPHEMERAL_PORT_START, TEST_DB_PORT_MIN, startTestDb, testDbPorts, withDb } from "./withDb.js";

withDb();

describe("Mongo de los tests", () => {
  it("escucha en un puerto fuera del rango efímero del sistema", () => {
    const port = Number(mongoose.connection.port);
    expect(port).toBeGreaterThanOrEqual(TEST_DB_PORT_MIN);
    expect(port).toBeLessThan(EPHEMERAL_PORT_START);
  });

  it("cada worker de una corrida arranca en un puerto distinto", () => {
    const [first] = testDbPorts(4242, 1);
    const [second] = testDbPorts(4242, 2);
    expect(first).not.toBe(second);
  });

  it("dos corridas en paralelo arrancan en puertos distintos", () => {
    expect(testDbPorts(4242, 1)[0]).not.toBe(testDbPorts(4243, 1)[0]);
  });

  it("todos los candidatos quedan fuera del rango efímero y no se repiten", () => {
    const ports = testDbPorts(99_999, 31);
    expect(ports.every((port) => port >= TEST_DB_PORT_MIN && port < EPHEMERAL_PORT_START)).toBe(true);
    expect(new Set(ports).size).toBe(ports.length);
  });
});

describe("dos archivos seguidos en el mismo worker", () => {
  it("el segundo Mongo también queda fuera del rango efímero", async () => {
    const first = await startTestDb();
    const firstPort = first.instanceInfo?.port ?? 0;
    await first.stop();
    const second = await startTestDb();
    const secondPort = second.instanceInfo?.port ?? 0;
    await second.stop();
    expect(firstPort).toBeLessThan(EPHEMERAL_PORT_START);
    expect(secondPort).toBeGreaterThanOrEqual(TEST_DB_PORT_MIN);
    expect(secondPort).toBeLessThan(EPHEMERAL_PORT_START);
  }, 60_000);
});
