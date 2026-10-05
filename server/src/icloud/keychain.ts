import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { IcloudAuthError, ICLOUD_KEYCHAIN_TIMEOUT_MESSAGE, ICLOUD_MISSING_PASSWORD_MESSAGE } from "./icloudErrors.js";

export const KEYCHAIN_SERVICE = "ledgerly-icloud-imap";

export const KEYCHAIN_TIMEOUT_MS = 10_000;

const SECURITY_BIN = "/usr/bin/security";

export type RunCommand = (file: string, args: string[]) => Promise<string>;

export interface KeychainDeps {
  run?: RunCommand;
  platform?: NodeJS.Platform;
}

const execFileAsync = promisify(execFile);

const runCommand: RunCommand = async (file, args) => (await execFileAsync(file, args, { timeout: KEYCHAIN_TIMEOUT_MS })).stdout;

const isTimeout = (err: unknown): boolean => err instanceof Error && "killed" in err && err.killed === true;

const lookupArgs = (user: string): string[] => ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", user];

export async function hasIcloudPassword(
  user: string, { run = runCommand, platform = process.platform }: KeychainDeps = {},
): Promise<boolean> {
  if (platform !== "darwin") return false;
  try {
    await run(SECURITY_BIN, lookupArgs(user));
    return true;
  } catch {
    return false;
  }
}

export async function readIcloudPassword(
  user: string, { run = runCommand, platform = process.platform }: KeychainDeps = {},
): Promise<string> {
  const missing = new IcloudAuthError(ICLOUD_MISSING_PASSWORD_MESSAGE);
  if (platform !== "darwin") throw missing;
  const output = await run(SECURITY_BIN, [...lookupArgs(user), "-w"]).catch((err: unknown) => {
    throw isTimeout(err) ? new IcloudAuthError(ICLOUD_KEYCHAIN_TIMEOUT_MESSAGE) : missing;
  });
  const password = output.trim();
  if (!password) throw missing;
  return password;
}
