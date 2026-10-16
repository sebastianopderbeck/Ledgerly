import { describe, it, expect } from "vitest";
import express from "express";
import { createServer, type AddressInfo } from "node:net";
import request from "supertest";
import { withLocalServer, withLocalServers } from "./localServer.js";

const app = express();
app.get("/ping", (_req, res) => { res.json({ pong: true }); });

const local = withLocalServer(app);
const serve = withLocalServers();

const intruderError = (port: number): Promise<string | undefined> =>
  new Promise((resolve) => {
    const intruder = createServer();
    intruder.once("error", (error: NodeJS.ErrnoException) => resolve(error.code));
    intruder.listen(port, "127.0.0.1", () => {
      intruder.close();
      resolve(undefined);
    });
  });

describe("servers de los tests", () => {
  it("escuchan solo en 127.0.0.1", () => {
    expect((local.server.address() as AddressInfo).address).toBe("127.0.0.1");
  });

  it("ningún otro proceso puede tomar su puerto en 127.0.0.1", async () => {
    expect(await intruderError((local.server.address() as AddressInfo).port)).toBe("EADDRINUSE");
  });

  it("supertest les habla al mismo server", async () => {
    expect((await request(local.server).get("/ping")).body).toEqual({ pong: true });
  });

  it("los servers por test también escuchan en 127.0.0.1", async () => {
    const server = await serve(app);
    expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
    expect((await request(server).get("/ping")).body).toEqual({ pong: true });
  });
});
