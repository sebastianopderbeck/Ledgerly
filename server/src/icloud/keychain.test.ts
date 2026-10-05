import { describe, it, expect, vi } from "vitest";
import { hasIcloudPassword, readIcloudPassword } from "./keychain.js";
import { IcloudAuthError, ICLOUD_MISSING_PASSWORD_MESSAGE } from "./icloudErrors.js";

const USER = "usuario-sintetico@icloud.com";
const LOOKUP = ["find-generic-password", "-s", "ledgerly-icloud-imap", "-a", USER];

describe("hasIcloudPassword", () => {
  it("busca el ítem por servicio y cuenta, sin pedir la contraseña", async () => {
    const run = vi.fn(async () => "keychain: \"/Users/x/Library/Keychains/login.keychain-db\"");
    expect(await hasIcloudPassword(USER, { run, platform: "darwin" })).toBe(true);
    expect(run).toHaveBeenCalledWith("/usr/bin/security", LOOKUP);
  });

  it("si security falla, no hay contraseña", async () => {
    const run = vi.fn(async (): Promise<string> => {
      throw new Error("The specified item could not be found in the keychain.");
    });
    expect(await hasIcloudPassword(USER, { run, platform: "darwin" })).toBe(false);
  });

  it("fuera de macOS no hay contraseña y no corre nada", async () => {
    const run = vi.fn(async () => "");
    expect(await hasIcloudPassword(USER, { run, platform: "linux" })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("readIcloudPassword", () => {
  it("la lee con -w y le saca el salto de línea", async () => {
    const run = vi.fn(async () => "abcd-efgh-ijkl-mnop\n");
    expect(await readIcloudPassword(USER, { run, platform: "darwin" })).toBe("abcd-efgh-ijkl-mnop");
    expect(run).toHaveBeenCalledWith("/usr/bin/security", [...LOOKUP, "-w"]);
  });

  it("si security falla tira IcloudAuthError con los pasos y sin la salida del comando", async () => {
    const run = vi.fn(async (): Promise<string> => {
      throw new Error("security: SecKeychainSearchCopyNext: dato-filtrado-sintetico");
    });
    const error = await readIcloudPassword(USER, { run, platform: "darwin" }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(IcloudAuthError);
    expect((error as Error).message).toBe(ICLOUD_MISSING_PASSWORD_MESSAGE);
    expect((error as Error).message).not.toContain("dato-filtrado-sintetico");
  });

  it("una contraseña vacía cuenta como faltante", async () => {
    const run = vi.fn(async () => "  \n");
    await expect(readIcloudPassword(USER, { run, platform: "darwin" })).rejects.toThrow(ICLOUD_MISSING_PASSWORD_MESSAGE);
  });

  it("fuera de macOS tira el mismo error sin correr nada", async () => {
    const run = vi.fn(async () => "abcd-efgh-ijkl-mnop");
    await expect(readIcloudPassword(USER, { run, platform: "linux" })).rejects.toBeInstanceOf(IcloudAuthError);
    expect(run).not.toHaveBeenCalled();
  });
});
