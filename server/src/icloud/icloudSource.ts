import type { MailClient } from "../mail/mailClient.js";
import { mailScheduleFor, parseMailSchedule } from "../mail/mailSchedule.js";
import type { MailSourceSetup } from "../mail/mailSourceSetup.js";
import { openIcloudClient, type IcloudClientOptions } from "./icloudClient.js";
import {
  describeIcloudSetup, ICLOUD_PASSWORD_MISSING, ICLOUD_PASSWORD_VAR, ICLOUD_USER_VAR, icloudScopeLabel, icloudSearchSince, readIcloudConfig,
} from "./icloudConfig.js";
import { hasIcloudPassword, readIcloudPassword } from "./keychain.js";

export interface IcloudSourceDeps {
  hasPassword?: (user: string) => Promise<boolean>;
  readPassword?: (user: string) => Promise<string>;
  open?: (options: IcloudClientOptions) => Promise<MailClient>;
  now?: () => Date;
}

const envPassword = (env: NodeJS.ProcessEnv): string | null => env[ICLOUD_PASSWORD_VAR]?.trim() || null;

const disabled = (missing: string[]): MailSourceSetup =>
  ({ source: "icloud", missing, scope: null, schedule: null, openClient: null });

export async function icloudSourceSetup(env: NodeJS.ProcessEnv, {
  hasPassword = hasIcloudPassword, readPassword = readIcloudPassword, open = openIcloudClient, now = () => new Date(),
}: IcloudSourceDeps = {}): Promise<MailSourceSetup> {
  const config = readIcloudConfig(env);
  if (!config) return disabled([ICLOUD_USER_VAR]);
  const fromEnv = envPassword(env);
  const missing = fromEnv !== null || (await hasPassword(config.user)) ? [] : [ICLOUD_PASSWORD_MISSING];
  return {
    source: "icloud",
    missing,
    scope: icloudScopeLabel(config),
    schedule: mailScheduleFor("icloud", env),
    openClient: async () => open({
      user: config.user,
      password: fromEnv ?? await readPassword(config.user),
      mailboxes: config.mailboxes,
      since: icloudSearchSince(config, now()),
    }),
  };
}

export async function describeIcloudSource(
  env: NodeJS.ProcessEnv, hasPassword: (user: string) => Promise<boolean> = hasIcloudPassword,
): Promise<string> {
  const config = readIcloudConfig(env);
  const automatic = parseMailSchedule(env).days !== null;
  const fromEnv = envPassword(env) !== null;
  return describeIcloudSetup(config, config ? fromEnv || await hasPassword(config.user) : false, automatic);
}
