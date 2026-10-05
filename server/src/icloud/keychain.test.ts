import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((
    _file: string, _args: string[], _options: object,
    callback: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    callback(null, { stdout: "clave-app-sintetica\n", stderr: "" });
  }),
}));
import { execFile } from "node:child_process";
import { hasIcloudPassword, KEYCHAIN_TIMEOUT_MS, readIcloudPassword } from "./keychain.js";
import { IcloudAuthError, ICLOUD_KEYCHAIN_TIMEOUT_MESSAGE, ICLOUD_MISSING_PASSWORD_MESSAGE } from "./icloudErrors.js";

const USER = "usuario-sintetico@icloud.com";
const LOOKUP = ["find-generic-password", "-s", "ledgerly-icloud-imap", "-a", USER];

const timedOut = (): Error => Object.assign(new Error("Command failed"), { killed: true, signal: "SIGTERM" });

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

  it("si security no responde a tiempo, no hay contraseña", async () => {
    const run = vi.fn(async (): Promise<string> => {
      throw timedOut();
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

  it("si security no responde a tiempo tira IcloudAuthError con el aviso del Llavero bloqueado", async () => {
    const run = vi.fn(async (): Promise<string> => {
      throw timedOut();
    });
    const error = await readIcloudPassword(USER, { run, platform: "darwin" }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(IcloudAuthError);
    expect((error as Error).message).toBe(ICLOUD_KEYCHAIN_TIMEOUT_MESSAGE);
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

describe("corredor por defecto", () => {
  it("le pone un timeout de 10 s a security", async () => {
    expect(KEYCHAIN_TIMEOUT_MS).toBe(10_000);
    expect(await readIcloudPassword(USER, { platform: "darwin" })).toBe("clave-app-sintetica");
    expect(execFile).toHaveBeenCalledWith(
      "/usr/bin/security", [...LOOKUP, "-w"], { timeout: 10_000 }, expect.any(Function),
    );
  });
});
