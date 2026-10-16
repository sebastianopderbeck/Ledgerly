import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mailSourceSchema } from "@ledgerly/shared";
import { MAIL_CRON_HOURS } from "../mail/mailSchedule.js";

interface VercelConfig {
  outputDirectory: string;
  regions: string[];
  functions: Record<string, { maxDuration: number }>;
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
  crons?: { path: string; schedule: string }[];
}

const configPath = fileURLToPath(new URL("../../../vercel.json", import.meta.url));
const ignorePath = fileURLToPath(new URL("../../../.vercelignore", import.meta.url));
const ignored = (existsSync(ignorePath) ? readFileSync(ignorePath, "utf8") : "").split("\n").map((line) => line.trim());
const config = (existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {}) as VercelConfig;

const spaRewrite = (config.rewrites ?? []).find(({ destination }) => destination === "/index.html");
const spaPattern = new RegExp(`^${spaRewrite?.source ?? "$^"}$`);
const apiRewrite = (config.rewrites ?? []).find(({ destination }) => destination === "/api");
const apiPattern = new RegExp(`^${apiRewrite?.source ?? "$^"}$`);
const repoPath = (relative: string) => fileURLToPath(new URL(`../../../${relative}`, import.meta.url));

describe("vercel.json", () => {
  it("sirve el build de Vite como estático", () => {
    expect(config.outputDirectory).toBe("client/dist");
  });

  it("la función tiene 300 s", () => {
    expect(config.functions?.["api/index.ts"]).toEqual({ maxDuration: 300 });
  });

  it("cada función de vercel.json existe y no usa catch-all, que Vercel fuera de Next.js trata como un solo segmento", () => {
    const functions = Object.keys(config.functions ?? {});
    expect(functions.length).toBeGreaterThan(0);
    for (const path of functions) {
      expect(existsSync(repoPath(path))).toBe(true);
      expect(path).not.toContain("[...");
    }
  });

  it("todas las rutas de /api, de cualquier profundidad, van a la función", () => {
    for (const path of ["/api/health", "/api/auth/me", "/api/auth/google/callback", "/api/cron/mail/gmail", "/api/mail/notice/seen"]) {
      expect(apiPattern.test(path)).toBe(true);
    }
    expect(apiPattern.test("/flujo")).toBe(false);
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

  it("hay un cron por fuente de mail, a la hora del spec en Argentina (UTC-3)", () => {
    const crons = config.crons ?? [];
    expect(crons.map(({ path }) => path).sort()).toEqual(["/api/cron/mail/gmail", "/api/cron/mail/icloud"]);
    for (const { path, schedule } of crons) {
      const source = mailSourceSchema.parse(path.split("/").at(-1));
      const [minute, hour, ...rest] = schedule.split(" ");
      expect(minute).toBe("0");
      expect(Number(hour)).toBe((MAIL_CRON_HOURS[source] + 3) % 24);
      expect(rest).toEqual(["*", "*", "*"]);
    }
  });

  it("un deploy desde la CLI no sube secretos ni datos reales", () => {
    expect(ignored).toEqual(expect.arrayContaining([".env", "examples", "backups", "*.pdf", ".superpowers"]));
  });
});
