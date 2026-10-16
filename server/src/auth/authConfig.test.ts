import { describe, it, expect } from "vitest";
import { callbackUrl, isSecureOrigin, readAuthConfig } from "./authConfig.js";

const VALID_ENV = {
  GOOGLE_CLIENT_ID: "client-id-sintetico",
  GOOGLE_CLIENT_SECRET: "client-secret-sintetico",
  SESSION_SECRET: "s".repeat(32),
  OWNER_EMAIL: " Owner@Test.dev ",
  ALLOWED_EMAILS: "Otra@Test.dev, ,tercera@test.dev",
  PUBLIC_URL: "https://ledger.example.ts.net/",
};

const REQUIRED = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET", "OWNER_EMAIL", "PUBLIC_URL"];

describe("readAuthConfig", () => {
  it("normaliza los mails, suma al owner a la lista y deja solo el origin de PUBLIC_URL", () => {
    const config = readAuthConfig(VALID_ENV);
    expect(config.ownerEmail).toBe("owner@test.dev");
    expect([...config.allowedEmails].sort()).toEqual(["otra@test.dev", "owner@test.dev", "tercera@test.dev"]);
    expect(config.publicUrl).toBe("https://ledger.example.ts.net");
    expect(config.sessionSecret).toBe("s".repeat(32));
  });

  it.each(REQUIRED)("falla nombrando %s si falta", (name) => {
    expect(() => readAuthConfig({ ...VALID_ENV, [name]: " " })).toThrow(`Falta configurar el login: ${name}`);
  });

  it("nombra todas las que faltan", () => {
    expect(() => readAuthConfig({})).toThrow(`Falta configurar el login: ${REQUIRED.join(", ")}`);
  });

  it("rechaza un SESSION_SECRET corto", () => {
    expect(() => readAuthConfig({ ...VALID_ENV, SESSION_SECRET: "corto" }))
      .toThrow("SESSION_SECRET tiene que tener al menos 32 caracteres");
  });

  it("rechaza una PUBLIC_URL inválida", () => {
    expect(() => readAuthConfig({ ...VALID_ENV, PUBLIC_URL: "no-es-url" })).toThrow("PUBLIC_URL inválida: no-es-url");
  });

  it("sin ALLOWED_EMAILS entra solo el owner", () => {
    const { ALLOWED_EMAILS: _omit, ...env } = VALID_ENV;
    expect([...readAuthConfig(env).allowedEmails]).toEqual(["owner@test.dev"]);
  });
});

describe("callbackUrl e isSecureOrigin", () => {
  it("arma la redirect URI desde PUBLIC_URL", () => {
    expect(callbackUrl(readAuthConfig(VALID_ENV))).toBe("https://ledger.example.ts.net/api/auth/google/callback");
  });

  it("solo https es seguro", () => {
    expect(isSecureOrigin(readAuthConfig(VALID_ENV))).toBe(true);
    expect(isSecureOrigin(readAuthConfig({ ...VALID_ENV, PUBLIC_URL: "http://localhost:5173" }))).toBe(false);
  });
});
