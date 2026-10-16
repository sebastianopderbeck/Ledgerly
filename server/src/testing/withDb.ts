import { afterAll, beforeAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

export const TEST_DB_PORT_MIN = 30_000;
export const EPHEMERAL_PORT_START = 49_152;

const WORKER_SLOTS = 32;
const PORT_BLOCKS = Math.floor((EPHEMERAL_PORT_START - TEST_DB_PORT_MIN) / WORKER_SLOTS);
const MAX_PORT_TRIES = 10;

export const testDbPorts = (runId: number, workerId: number): number[] =>
  Array.from({ length: MAX_PORT_TRIES }, (_, attempt) =>
    TEST_DB_PORT_MIN + ((runId + attempt) % PORT_BLOCKS) * WORKER_SLOTS + (workerId % WORKER_SLOTS));

const isPortInUse = (error: unknown): boolean => error instanceof Error && /already in use/i.test(error.message);

const startTestDb = async (): Promise<MongoMemoryServer> => {
  for (const port of testDbPorts(process.ppid, Number(process.env.VITEST_POOL_ID ?? 0))) {
    try {
      return await MongoMemoryServer.create({ instance: { port } });
    } catch (error) {
      if (!isPortInUse(error)) throw error;
    }
  }
  throw new Error("No hay un puerto libre para el Mongo de los tests");
};

export function withDb(): void {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await startTestDb();
    await mongoose.connect(mongod.getUri());
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });
}
