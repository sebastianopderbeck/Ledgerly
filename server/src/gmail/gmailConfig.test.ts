import { describe, it, expect } from "vitest";
import {
  DEFAULT_GMAIL_QUERY, describeGmailSetup, missingGmailVars, readGmailConfig,
} from "./gmailConfig.js";

const CREDENTIALS = {
  GMAIL_CLIENT_ID: "id-sintetico.apps.googleusercontent.com",
  GMAIL_CLIENT_SECRET: "secreto-sintetico",
  GMAIL_REFRESH_TOKEN: "1//refresh-sintetico",
};
const env = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({ ...CREDENTIALS, ...extra });

describe("readGmailConfig", () => {
  it("con las tres credenciales devuelve la config con la consulta por defecto y sin intervalo", () => {
    expect(readGmailConfig(env())).toEqual({
      credentials: {
        clientId: CREDENTIALS.GMAIL_CLIENT_ID,
        clientSecret: CREDENTIALS.GMAIL_CLIENT_SECRET,
        refreshToken: CREDENTIALS.GMAIL_REFRESH_TOKEN,
      },
      query: DEFAULT_GMAIL_QUERY,
      intervalMinutes: null,
    });
  });

  it.each(["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"])("sin %s devuelve null", (key) => {
    expect(readGmailConfig(env({ [key]: undefined }))).toBeNull();
  });

  it("una credencial en blanco cuenta como faltante", () => {
    expect(readGmailConfig(env({ GMAIL_REFRESH_TOKEN: "   " }))).toBeNull();
  });

  it("recorta los espacios de las credenciales", () => {
    expect(readGmailConfig(env({ GMAIL_CLIENT_ID: "  id-con-espacios  " }))?.credentials.clientId).toBe("id-con-espacios");
  });

  it("usa GMAIL_QUERY recortada, o la consulta por defecto si está vacía", () => {
    expect(readGmailConfig(env({ GMAIL_QUERY: "  from:banco has:attachment  " }))?.query).toBe("from:banco has:attachment");
    expect(readGmailConfig(env({ GMAIL_QUERY: "   " }))?.query).toBe(DEFAULT_GMAIL_QUERY);
  });

  it("lee el intervalo de la búsqueda automática", () => {
    expect(readGmailConfig(env({ GMAIL_SYNC_INTERVAL_MINUTES: "360" }))?.intervalMinutes).toBe(360);
  });
});

describe("missingGmailVars", () => {
  it("nombra solo las credenciales que faltan", () => {
    expect(missingGmailVars(env())).toEqual([]);
    expect(missingGmailVars(env({ GMAIL_CLIENT_SECRET: "" }))).toEqual(["GMAIL_CLIENT_SECRET"]);
    expect(missingGmailVars({})).toEqual(["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"]);
  });
});

describe("describeGmailSetup", () => {
  const lines = [
    describeGmailSetup({}),
    describeGmailSetup(env()),
    describeGmailSetup(env({ GMAIL_SYNC_INTERVAL_MINUTES: "5" })),
    describeGmailSetup(env({ GMAIL_SYNC_INTERVAL_MINUTES: "360" })),
  ];

  it("arma la línea de arranque para cada caso", () => {
    expect(lines).toEqual([
      "Gmail: deshabilitado (faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)",
      "Gmail: búsqueda manual; automática apagada",
      "Gmail: búsqueda manual; GMAIL_SYNC_INTERVAL_MINUTES inválido (entero ≥ 15), automática apagada",
      "Gmail: búsqueda automática cada 360 min",
    ]);
  });

  it("nunca incluye los valores de las credenciales", () => {
    for (const line of lines) {
      for (const value of Object.values(CREDENTIALS)) expect(line).not.toContain(value);
    }
  });
});
