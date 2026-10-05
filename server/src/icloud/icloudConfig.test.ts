import { describe, it, expect } from "vitest";
import {
  describeIcloudSetup, icloudScopeLabel, icloudSearchSince, parseIcloudMailboxes, parseIcloudSince, readIcloudConfig,
} from "./icloudConfig.js";

const USER = "usuario-sintetico@icloud.com";
const DAY_MS = 86_400_000;

describe("readIcloudConfig", () => {
  it("sin ICLOUD_USER no hay configuración", () => {
    expect(readIcloudConfig({})).toBeNull();
    expect(readIcloudConfig({ ICLOUD_USER: "   " })).toBeNull();
  });

  it("con solo la cuenta usa INBOX, la ventana por defecto y búsqueda manual", () => {
    expect(readIcloudConfig({ ICLOUD_USER: ` ${USER} ` })).toEqual({
      user: USER, since: null, sinceInvalid: false, mailboxes: ["INBOX"], intervalMinutes: null, intervalInvalid: false,
    });
  });

  it("lee fecha, carpetas e intervalo", () => {
    expect(readIcloudConfig({
      ICLOUD_USER: USER, ICLOUD_SINCE: "2026-09-01", ICLOUD_MAILBOXES: " INBOX , Bancos,,Bancos ",
      ICLOUD_SYNC_INTERVAL_MINUTES: "360",
    })).toEqual({
      user: USER, since: "2026-09-01", sinceInvalid: false, mailboxes: ["INBOX", "Bancos"], intervalMinutes: 360, intervalInvalid: false,
    });
  });

  it("marca la fecha y el intervalo inválidos", () => {
    expect(readIcloudConfig({ ICLOUD_USER: USER, ICLOUD_SINCE: "01/09/2026", ICLOUD_SYNC_INTERVAL_MINUTES: "5" }))
      .toMatchObject({ since: null, sinceInvalid: true, intervalMinutes: null, intervalInvalid: true });
  });
});

describe("parseIcloudSince", () => {
  it.each([
    ["2026-09-01", "2026-09-01"],
    ["2024-02-29", "2024-02-29"],
    ["2026-02-29", null],
    ["2026-13-01", null],
    ["2026-9-1", null],
    ["", null],
  ])("%j → %j", (raw, expected) => {
    expect(parseIcloudSince(raw)).toBe(expected);
  });
});

describe("parseIcloudMailboxes", () => {
  it("vacío vuelve a INBOX", () => {
    expect(parseIcloudMailboxes("")).toEqual(["INBOX"]);
    expect(parseIcloudMailboxes(" , ")).toEqual(["INBOX"]);
  });
});

describe("icloudSearchSince", () => {
  it("con fecha usa la medianoche local de ese día", () => {
    expect(icloudSearchSince({ since: "2026-09-01" }, new Date(2026, 9, 5, 12))).toEqual(new Date(2026, 8, 1));
  });

  it("sin fecha mira 90 días hacia atrás desde ahora", () => {
    const now = new Date(2026, 9, 5, 12);
    expect(icloudSearchSince({ since: null }, now)).toEqual(new Date(now.getTime() - 90 * DAY_MS));
  });
});

describe("icloudScopeLabel", () => {
  it("nombra las carpetas y la ventana", () => {
    expect(icloudScopeLabel({ since: "2026-09-01", mailboxes: ["INBOX"] })).toBe("INBOX · desde el 01/09/2026");
    expect(icloudScopeLabel({ since: null, mailboxes: ["INBOX", "Bancos"] })).toBe("INBOX, Bancos · últimos 90 días");
  });
});

describe("describeIcloudSetup", () => {
  it("dice qué falta", () => {
    expect(describeIcloudSetup(null, false)).toBe("iCloud: deshabilitado (falta ICLOUD_USER)");
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), false))
      .toBe("iCloud: deshabilitado (falta la contraseña de app en el Llavero)");
  });

  it("con intervalo y sin contraseña avisa que las corridas van a fallar", () => {
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER, ICLOUD_SYNC_INTERVAL_MINUTES: "360" }), false)).toBe(
      "iCloud: búsqueda automática cada 360 min (INBOX · últimos 90 días); falta la contraseña de app en el Llavero, las corridas van a fallar hasta que la cargues",
    );
  });

  it("describe la búsqueda automática o manual con su alcance", () => {
    expect(describeIcloudSetup(readIcloudConfig({
      ICLOUD_USER: USER, ICLOUD_SINCE: "2026-09-01", ICLOUD_SYNC_INTERVAL_MINUTES: "360",
    }), true)).toBe("iCloud: búsqueda automática cada 360 min (INBOX · desde el 01/09/2026)");
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), true))
      .toBe("iCloud: búsqueda manual; automática apagada (INBOX · últimos 90 días)");
  });

  it("avisa los valores inválidos", () => {
    expect(describeIcloudSetup(readIcloudConfig({
      ICLOUD_USER: USER, ICLOUD_SINCE: "ayer", ICLOUD_SYNC_INTERVAL_MINUTES: "5",
    }), true)).toBe(
      "iCloud: búsqueda manual; automática apagada (INBOX · últimos 90 días); ICLOUD_SINCE inválido (AAAA-MM-DD), uso los últimos 90 días; ICLOUD_SYNC_INTERVAL_MINUTES inválido (entero ≥ 15), automática apagada",
    );
  });

  it("no incluye la cuenta", () => {
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), true)).not.toContain(USER);
  });
});
