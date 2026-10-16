import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface VercelConfig {
  outputDirectory: string;
  regions: string[];
  functions: Record<string, { maxDuration: number }>;
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
  crons?: { path: string; schedule: string }[];
}

const configPath = fileURLToPath(new URL("../../../vercel.json", import.meta.url));
const config = (existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {}) as VercelConfig;

const spaRewrite = (config.rewrites ?? []).find(({ destination }) => destination === "/index.html");
const spaPattern = new RegExp(`^${spaRewrite?.source ?? "$^"}$`);

describe("vercel.json", () => {
  it("sirve el build de Vite como estático", () => {
    expect(config.outputDirectory).toBe("client/dist");
  });

  it("la función tiene 300 s", () => {
    expect(config.functions?.["api/[...path].ts"]).toEqual({ maxDuration: 300 });
  });

  it("corre en una sola región", () => {
    expect(config.regions).toHaveLength(1);
  });

  it("el rewrite del SPA no tapa /api", () => {
    expect(spaPattern.test("/flujo")).toBe(true);
    expect(spaPattern.test("/")).toBe(true);
    expect(spaPattern.test("/api/health")).toBe(false);
    expect(spaPattern.test("/api/cron/mail/gmail")).toBe(false);
  });

  it("manda los headers de seguridad en todas las rutas", () => {
    const all = (config.headers ?? []).find(({ source }) => source === "/(.*)")?.headers ?? [];
    expect(all).toEqual(expect.arrayContaining([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ]));
  });
});
