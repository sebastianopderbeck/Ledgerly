import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { withLocalServers } from "../testing/localServer.js";
import { createHandler } from "./handler.js";

const serve = withLocalServers();
const ENV = { MONGO_URL: "mongodb://sintetico/ledgerly" };

const pingApp = () => {
  const app = express();
  app.get("/api/health", (_req, res) => { res.json({ status: "ok" }); });
  return app;
};

afterEach(() => vi.restoreAllMocks());

describe("createHandler", () => {
  it("conecta, arma la app una vez y le pasa los requests", async () => {
    const connect = vi.fn(async () => undefined);
    const build = vi.fn(pingApp);
    const server = await serve(createHandler({ env: ENV, connect, build }));
    expect((await request(server).get("/api/health")).body).toEqual({ status: "ok" });
    expect((await request(server).get("/api/health")).status).toBe(200);
    expect(connect).toHaveBeenCalledWith(ENV.MONGO_URL);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("si Mongo no conecta responde 500 genérico y el próximo request reintenta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("Atlas no responde"))
      .mockResolvedValue(undefined);
    const server = await serve(createHandler({ env: ENV, connect, build: pingApp }));
    const first = await request(server).get("/api/health");
    expect(first.status).toBe(500);
    expect(first.body).toEqual({ error: "Error interno" });
    expect((await request(server).get("/api/health")).status).toBe(200);
  });

  it("sin MONGO_URL responde 500 sin intentar conectar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const connect = vi.fn(async () => undefined);
    const server = await serve(createHandler({ env: {}, connect, build: pingApp }));
    expect((await request(server).get("/api/health")).status).toBe(500);
    expect(connect).not.toHaveBeenCalled();
  });
});
