import type { MailSource } from "@ledgerly/shared";
import { gmailSourceSetup } from "../gmail/gmailSource.js";
import { icloudSourceSetup } from "../icloud/icloudSource.js";
import type { MailSourceSetup } from "./mailSourceSetup.js";

export const MAIL_SOURCE_ORDER: MailSource[] = ["icloud", "gmail"];

const readers: Record<MailSource, (env: NodeJS.ProcessEnv) => Promise<MailSourceSetup>> = {
  gmail: async (env) => gmailSourceSetup(env),
  icloud: (env) => icloudSourceSetup(env),
};

export const readMailSourceSetup = (source: MailSource, env: NodeJS.ProcessEnv): Promise<MailSourceSetup> =>
  readers[source](env);

export const readMailSourceSetups = (env: NodeJS.ProcessEnv): Promise<MailSourceSetup[]> =>
  Promise.all(MAIL_SOURCE_ORDER.map((source) => readMailSourceSetup(source, env)));
