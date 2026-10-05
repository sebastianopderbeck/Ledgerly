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

  it("con solo la cuenta usa INBOX, la ventana por defecto", () => {
    expect(readIcloudConfig({ ICLOUD_USER: ` ${USER} ` })).toEqual({
      user: USER, since: null, sinceInvalid: false, mailboxes: ["INBOX"],
    });
  });

  it("lee fecha y carpetas", () => {
    expect(readIcloudConfig({
      ICLOUD_USER: USER, ICLOUD_SINCE: "2026-09-01", ICLOUD_MAILBOXES: " INBOX , Bancos,,Bancos ",
    })).toEqual({
      user: USER, since: "2026-09-01", sinceInvalid: false, mailboxes: ["INBOX", "Bancos"],
    });
  });

  it("marca la fecha inválida", () => {
    expect(readIcloudConfig({ ICLOUD_USER: USER, ICLOUD_SINCE: "01/09/2026" }))
      .toMatchObject({ since: null, sinceInvalid: true });
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
    expect(describeIcloudSetup(null, false, true)).toBe("iCloud: deshabilitado (falta ICLOUD_USER)");
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), false, false))
      .toBe("iCloud: deshabilitado (falta la contraseña de app en el Llavero)");
  });

  it("con búsqueda automática y sin contraseña avisa que las corridas van a fallar", () => {
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), false, true)).toBe(
      "iCloud: habilitado (INBOX · últimos 90 días); falta la contraseña de app en el Llavero, las corridas van a fallar hasta que la cargues",
    );
  });

  it("describe el alcance cuando está habilitada", () => {
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER, ICLOUD_SINCE: "2026-09-01" }), true, true))
      .toBe("iCloud: habilitado (INBOX · desde el 01/09/2026)");
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), true, false))
      .toBe("iCloud: habilitado (INBOX · últimos 90 días)");
  });

  it("avisa la fecha inválida", () => {
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER, ICLOUD_SINCE: "ayer" }), true, false)).toBe(
      "iCloud: habilitado (INBOX · últimos 90 días); ICLOUD_SINCE inválido (AAAA-MM-DD), uso los últimos 90 días",
    );
  });

  it("no incluye la cuenta", () => {
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), true, true)).not.toContain(USER);
  });
});
