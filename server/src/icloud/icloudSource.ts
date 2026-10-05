import type { MailClient } from "../mail/mailClient.js";
import { parseMailSchedule } from "../mail/mailSchedule.js";
import type { MailSourceSetup } from "../mail/mailSourceSetup.js";
import { openIcloudClient, type IcloudClientOptions } from "./icloudClient.js";
import {
  describeIcloudSetup, ICLOUD_PASSWORD_MISSING, ICLOUD_USER_VAR, icloudScopeLabel, icloudSearchSince, readIcloudConfig,
} from "./icloudConfig.js";
import { hasIcloudPassword, readIcloudPassword } from "./keychain.js";

export interface IcloudSourceDeps {
  hasPassword?: (user: string) => Promise<boolean>;
  readPassword?: (user: string) => Promise<string>;
  open?: (options: IcloudClientOptions) => Promise<MailClient>;
  now?: () => Date;
}

const disabled = (missing: string[]): MailSourceSetup =>
  ({ source: "icloud", missing, scope: null, schedule: null, openClient: null });

export async function icloudSourceSetup(env: NodeJS.ProcessEnv, {
  hasPassword = hasIcloudPassword, readPassword = readIcloudPassword, open = openIcloudClient, now = () => new Date(),
}: IcloudSourceDeps = {}): Promise<MailSourceSetup> {
  const config = readIcloudConfig(env);
  if (!config) return disabled([ICLOUD_USER_VAR]);
  const missing = (await hasPassword(config.user)) ? [] : [ICLOUD_PASSWORD_MISSING];
  return {
    source: "icloud",
    missing,
    scope: icloudScopeLabel(config),
    schedule: parseMailSchedule(env).schedule,
    openClient: async () => open({
      user: config.user,
      password: await readPassword(config.user),
      mailboxes: config.mailboxes,
      since: icloudSearchSince(config, now()),
    }),
  };
}

export async function describeIcloudSource(
  env: NodeJS.ProcessEnv, hasPassword: (user: string) => Promise<boolean> = hasIcloudPassword,
): Promise<string> {
  const config = readIcloudConfig(env);
  const automatic = parseMailSchedule(env).schedule !== null;
  return describeIcloudSetup(config, config ? await hasPassword(config.user) : false, automatic);
}
