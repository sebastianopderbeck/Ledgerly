import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveClient } from "./serveClient.js";

let dist: string;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "ledgerly-dist-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><div id=root>SPA</div>");
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

function appWith(distDir: string) {
  const app = express();
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  serveClient(app, distDir);
  return app;
}

describe("serveClient", () => {
  it("sirve index.html en la raíz", async () => {
    const res = await request(appWith(dist)).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("SPA");
  });
  it("hace fallback de rutas del SPA a index.html", async () => {
    const res = await request(appWith(dist)).get("/dashboard");
    expect(res.status).toBe(200);
    expect(res.text).toContain("SPA");
  });
  it("no intercepta /api", async () => {
    const res = await request(appWith(dist)).get("/api/health");
    expect(res.body).toEqual({ ok: true });
  });
  it("es no-op si el dist no existe", async () => {
    const res = await request(appWith(join(dist, "nope"))).get("/");
    expect(res.status).toBe(404);
  });
});
