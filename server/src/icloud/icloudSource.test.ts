import { describe, it, expect, vi } from "vitest";
import { fakeMailClient } from "../testing/mailFixtures.js";
import { describeIcloudSource, icloudSourceSetup } from "./icloudSource.js";

const USER = "usuario-sintetico@icloud.com";
const NOW = new Date(2026, 9, 5, 12);

const deps = (hasPassword: boolean) => ({
  hasPassword: vi.fn(async () => hasPassword),
  readPassword: vi.fn(async () => "clave-app-sintetica"),
  open: vi.fn(async () => fakeMailClient([])),
  now: () => NOW,
});

describe("icloudSourceSetup", () => {
  it("sin ICLOUD_USER queda deshabilitada sin mirar el Llavero", async () => {
    const d = deps(true);
    expect(await icloudSourceSetup({}, d)).toEqual({
      source: "icloud", missing: ["ICLOUD_USER"], scope: null, intervalMinutes: null, openClient: null,
    });
    expect(d.hasPassword).not.toHaveBeenCalled();
  });

  it("sin la contraseña en el Llavero queda deshabilitada", async () => {
    const d = deps(false);
    expect(await icloudSourceSetup({ ICLOUD_USER: USER }, d)).toMatchObject({
      source: "icloud", missing: ["la contraseña de app en el Llavero"], openClient: null,
    });
    expect(d.hasPassword).toHaveBeenCalledWith(USER);
  });

  it("habilitada informa alcance e intervalo, y lee la contraseña recién al abrir", async () => {
    const d = deps(true);
    const setup = await icloudSourceSetup({ ICLOUD_USER: USER, ICLOUD_SYNC_INTERVAL_MINUTES: "360" }, d);
    expect(setup).toMatchObject({ source: "icloud", missing: [], scope: "INBOX · últimos 90 días", intervalMinutes: 360 });
    expect(d.readPassword).not.toHaveBeenCalled();
    await setup.openClient?.();
    expect(d.readPassword).toHaveBeenCalledWith(USER);
    expect(d.open).toHaveBeenCalledWith({
      user: USER, password: "clave-app-sintetica", mailboxes: ["INBOX"], since: new Date(NOW.getTime() - 90 * 86_400_000),
    });
  });
});

describe("describeIcloudSource", () => {
  it("mira el Llavero solo si hay cuenta", async () => {
    const hasPassword = vi.fn(async () => true);
    expect(await describeIcloudSource({}, hasPassword)).toBe("iCloud: deshabilitado (falta ICLOUD_USER)");
    expect(hasPassword).not.toHaveBeenCalled();
    expect(await describeIcloudSource({ ICLOUD_USER: USER, ICLOUD_SINCE: "2026-09-01" }, hasPassword))
      .toBe("iCloud: búsqueda manual; automática apagada (INBOX · desde el 01/09/2026)");
  });
});
